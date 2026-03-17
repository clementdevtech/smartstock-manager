const asyncHandler = require("express-async-handler");
const { query } = require("../config/db");
const sqlite = require("../sqlite");
const sendEmail = require("../utils/email");
const csv = require("csv-parser");
const fs = require("fs");
const { pipeline } = require("stream/promises");

const BATCH_SIZE = 500;

/* =====================================================
   HELPERS
===================================================== */
const getTenant = (req) => ({
  adminId: req.user.adminId || req.user.id,
  storeId: req.user.storeId,
});

const isOnline = async () => {
  try {
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
};

/* =====================================================
   LOW STOCK EMAIL
===================================================== */
const sendLowStockEmail = async (item, email) => {
  if (!email) return;
  if (Number(item.quantity) > Number(item.lowstockthreshold || item.low_stock_threshold)) return;

  const html = `
    <h2>⚠️ Low Stock Alert</h2>
    <ul>
      <li><strong>Name:</strong> ${item.name}</li>
      <li><strong>SKU:</strong> ${item.sku}</li>
      <li><strong>Quantity:</strong> ${item.quantity}</li>
    </ul>
    <small>SmartStock POS</small>
  `;

  await sendEmail(email, `Low Stock: ${item.name}`, html);
};

/* =====================================================
   GET ITEMS (OFFLINE FIRST)
===================================================== */
const getItems = asyncHandler(async (req, res) => {
  const { adminId } = getTenant(req);
  const storeId = req.query.storeId; 

  if (!storeId) {
    return res.status(400).json({ message: "storeId is required" });
  }


  try {
    // Fetch from local SQLite first (offline support)
    const localItems = await sqlite.all(
      `SELECT * FROM local_items
       WHERE adminId = ? AND storeId = ? AND deleted = 0
       ORDER BY updatedAt DESC`,
      [adminId, storeId]
    );

    if (!(await isOnline())) {
      console.log("📡 Offline mode: returning local items");
      return res.json(localItems);
    }

    // Fetch from online Postgres if online
    const { rows } = await query(
      `SELECT * FROM items
       WHERE admin_id = $1 AND store_id = $2
       ORDER BY updated_at DESC`,
      [adminId, storeId]
    );

    // Optionally: merge localItems with rows if there are unsynced offline items
    // For now, we just return online rows
    res.json(rows);

  } catch (err) {
    console.error("❌ Error fetching items:", err.message);
    res.status(500).json({ message: "Failed to fetch items", error: err.message });
  }
});

/* =====================================================
   GET ITEM BY ID
===================================================== */
const getItemById = asyncHandler(async (req, res) => {
  const { adminId } = getTenant(req);
  const storeId = req.query.storeId;

  const local = sqlite.get(
    `SELECT * FROM local_items
     WHERE postgresId = ? AND adminId = ? AND storeId = ?`,
    [req.params.id, adminId, storeId]
  );

  if (local) return res.json(local);

  if (!(await isOnline())) {
    res.status(404);
    throw new Error("Item not found offline");
  }

  const { rows } = await query(
    `SELECT * FROM items
     WHERE id = $1 AND admin_id = $2 AND store_id = $3`,
    [req.params.id, adminId, storeId]
  );

  if (!rows.length) {
    res.status(404);
    throw new Error("Item not found");
  }

  res.json(rows[0]);
});

/* =====================================================
   GET ITEM BY BARCODE
===================================================== */
const getItemByBarcode = asyncHandler(async (req, res) => {
  const { adminId } = getTenant(req);
  const storeId = req.query.storeId;

  const local = sqlite.get(
    `SELECT * FROM local_items
     WHERE (barcode = ? OR sku = ?)
     AND adminId = ? AND storeId = ?`,
    [req.params.code, req.params.code, adminId, storeId]
  );

  if (local) return res.json(local);

  if (!(await isOnline())) {
    res.status(404);
    throw new Error("Item not found offline");
  }

  const { rows } = await query(
    `SELECT * FROM items
     WHERE (barcode = $1 OR sku = $1)
     AND admin_id = $2 AND store_id = $3`,
    [req.params.code, adminId, storeId]
  );

  if (!rows.length) {
    res.status(404);
    throw new Error("Item not found");
  }

  res.json(rows[0]);
});

/* =====================================================
   CREATE ITEM (ENTERPRISE READY)
===================================================== */
const normalizeUnit = (unit) => {
  const map = {
    piece: "pcs",
    pieces: "pcs",
    packet: "pcs",
    packets: "pcs",
    bale: "cartons",
    box: "cartons",
    kg: "kg",
    liter: "liters",
    liters: "liters"
  };

  return map[unit?.toLowerCase()] || "pcs";
};

const createItem = asyncHandler(async (req, res) => {
  const { adminId } = getTenant(req);
  const storeId = req.body.storeId || req.user?.storeId;

  if (!storeId) {
    res.status(400);
    throw new Error("Store ID is required");
  }

  if (!adminId) {
    throw new Error("Admin ID is required");
  }

  const data = req.body;

  /* ===============================
     VALIDATION
  =============================== */
  if (Number(data.costPrice) < 0)
    throw new Error("Cost price cannot be negative");

  if (Number(data.retailPrice) < 0)
    throw new Error("Retail price cannot be negative");

  if (Number(data.quantity) < 0)
    throw new Error("Quantity cannot be negative");

  /* ===============================
     NORMALIZATION
  =============================== */
  const costPrice = Number(data.costPrice || 0);
  const retailPrice = Number(data.retailPrice || 0);
  const wholesalePrice = Number(data.wholesalePrice || 0);

  const stockUnit = normalizeUnit(data.stockUnit);
  const sellingUnit = normalizeUnit(data.sellingUnit);
  const unitsPerPackage = Number(data.unitsPerPackage || 1);
  const packageUnit = data.packageUnit || null;

  const minSaleQty = Number(data.minSaleQty || 1);
  const saleStep = Number(data.saleStep || 1);

  const quantity = Number(data.quantity || 0);
  const lowStockThreshold = Number(data.lowStockThreshold || 5);

  const supplier = JSON.stringify(data.supplier || {});
  const createdBy = req.user?.id || adminId;

  /* ===============================
     SQLITE (OFFLINE FIRST)
  =============================== */
  sqlite.run(
    `INSERT INTO local_items (
      sku, barcode, name, category,
      costPrice, wholesalePrice, retailPrice,
      quantity, lowStockThreshold,
      stockUnit, sellingUnit, unitsPerPackage,
      packageUnit, minSaleQty, saleStep,
      supplier, adminId, storeId, syncStatus
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.sku,
      data.barcode || null,
      data.name,
      data.category || "general",

      costPrice,
      wholesalePrice,
      retailPrice,

      quantity,
      lowStockThreshold,

      stockUnit,
      sellingUnit,
      unitsPerPackage,

      packageUnit,
      minSaleQty,
      saleStep,

      supplier,
      adminId,
      storeId,
      "pending"
    ]
  );

  /* STOCK MOVEMENT LOG */
  sqlite.run(
    `INSERT INTO stock_movements (itemId, movementType, quantity, notes)
     VALUES (
       (SELECT id FROM local_items WHERE sku = ? AND storeId = ?),
       'purchase',
       ?,
       'Initial stock'
     )`,
    [data.sku, storeId, quantity]
  );

  /* ===============================
     ONLINE SYNC (POSTGRES)
  =============================== */
  if (await isOnline()) {
    const { rows } = await query(
      `INSERT INTO items (
        name, sku, barcode, category,

        cost_price,
        wholesale_price, retail_price,

        quantity, low_stock_threshold,

        unit, selling_unit, units_per_package,
        measurement_unit,

        package_unit, min_sale_qty, sale_step,

        supplier,

        admin_id, store_id, created_by
      )
      VALUES (
        $1,$2,$3,$4,
        $5,
        $6,$7,
        $8,$9,
        $10,$11,$12,
        $13,
        $14,$15,$16,
        $17,
        $18,$19,$20
      )
      RETURNING *`,
      [
        data.name,
        data.sku,
        data.barcode || null,
        data.category || "general",

        costPrice,

        wholesalePrice,
        retailPrice,

        quantity,
        lowStockThreshold,

        stockUnit,          // ✅ normalized
        sellingUnit,        // ✅ normalized
        unitsPerPackage,

        data.measurementUnit || null,

        packageUnit,
        minSaleQty,
        saleStep,

        data.supplier || {},

        adminId,
        storeId,
        createdBy
      ]
    );

    sqlite.run(
      `UPDATE local_items
       SET postgresId = ?, syncStatus = 'synced'
       WHERE sku = ? AND storeId = ?`,
      [rows[0].id, data.sku, storeId]
    );
  }

  res.status(201).json({ message: "Item created successfully" });
});

/* =====================================================
   UPDATE ITEM QUANTITY
===================================================== */
const updateItem = asyncHandler(async (req, res) => {
  const { adminId } = getTenant(req);
  const storeId = req.query.storeId;
  const data = req.body;

  sqlite.run(
    `UPDATE local_items
     SET name = ?,
         costPrice = ?,
         retailPrice = ?,
         wholesalePrice = ?,
         quantity = ?,
         stockUnit = ?,
         sellingUnit = ?,
         unitsPerPackage = ?,
         updatedAt = CURRENT_TIMESTAMP,
         syncStatus = 'pending'
     WHERE postgresId = ? AND adminId = ? AND storeId = ?`,
    [
      data.name,
      data.costPrice,
      data.retailPrice,
      data.wholesalePrice,
      data.quantity,
      data.stockUnit,
      data.sellingUnit,
      data.unitsPerPackage,
      req.params.id,
      adminId,
      storeId,
    ]
  );

  if (await isOnline()) {
    await query(
      `UPDATE items SET
         name = $1,
         cost_price = $2,
         retail_price = $3,
         wholesale_price = $4,
         quantity = $5,
         stock_unit = $6,
         selling_unit = $7,
         units_per_package = $8,
         updated_at = now()
       WHERE id = $9 AND admin_id = $10 AND store_id = $11`,
      [
        data.name,
        data.costPrice,
        data.retailPrice,
        data.wholesalePrice,
        data.quantity,
        data.stockUnit,
        data.sellingUnit,
        data.unitsPerPackage,
        req.params.id,
        adminId,
        storeId,
      ]
    );
  }

  res.json({ message: "Item updated successfully" });
});

/* =====================================================
   DELETE ITEM (SOFT DELETE)
===================================================== */
const deleteItem = asyncHandler(async (req, res) => {
  const { adminId } = getTenant(req);
  const storeId = req.query.storeId;

  sqlite.run(
    `UPDATE local_items
     SET deleted = 1, syncStatus = 'pending'
     WHERE postgresId = ? AND adminId = ? AND storeId = ?`,
    [req.params.id, adminId, storeId]
  );

  if (await isOnline()) {
    await query(
      `DELETE FROM items
       WHERE id = $1 AND admin_id = $2 AND store_id = $3`,
      [req.params.id, adminId, storeId]
    );
  }

  res.json({ message: "Item deleted (offline-first)" });
});

/* =====================================================
   WEEKLY BEST ITEMS (NEW RELATIONAL LOGIC)
===================================================== */
const getWeeklyBestItems = asyncHandler(async (req, res) => {
  if (!(await isOnline())) return res.json([]);

  const { adminId } = getTenant(req);
  const storeId = req.query.storeId;

  const { rows } = await query(
    `
    SELECT i.name, i.sku, SUM(si.quantity) AS total_sold
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN items i ON i.id = si.item_id
    WHERE s.created_at >= now() - interval '7 days'
      AND s.admin_id = $1
      AND s.store_id = $2
    GROUP BY i.id
    ORDER BY total_sold DESC
    LIMIT 10
    `,
    [adminId, storeId]
  );

  res.json(rows);
});


/* =====================================================
   CREATE STOCK MOVEMENT
===================================================== */
const createStockMovement = async (req, res) => {
  try {
    const { itemId, movementType, quantity, referenceId, notes } = req.body;

    // Basic validation
    if (!itemId || !movementType || quantity == null) {
      return res.status(400).json({
        error: "itemId, movementType and quantity are required",
      });
    }

    await sqlite.run(
      `INSERT INTO stock_movements 
       (itemId, movementType, quantity, referenceId, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [
        itemId,
        movementType,
        quantity,
        referenceId || null,
        notes || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Stock movement recorded successfully",
    });

  } catch (err) {
    console.error("❌ Stock Movement Error:", err);
    res.status(500).json({
      error: "Failed to record stock movement",
      details: err.message,
    });
  }
};

const erpSync = asyncHandler(async (req, res) => {
  const payload = req.body;

  for (const item of payload.items) {
    await query(
      `
      INSERT INTO items (sku, name, quantity, retail_price, store_id)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (sku, store_id)
      DO UPDATE SET quantity = EXCLUDED.quantity
      `,
      [
        item.sku,
        item.name,
        item.qty,
        item.price,
        payload.storeId,
      ]
    );
  }

  res.json({ success: true });
});

const processEdi850 = asyncHandler(async (req, res) => {
  const edi = req.body;

  for (const line of edi.lines) {
    await query(`
        UPDATE items
        SET quantity = GREATEST(quantity - $1, 0)
        WHERE sku = $2 AND store_id = $3
        `, [line.qty, line.sku, edi.storeId]);
      }
      
  res.json({ ok: true });
});


async function bulkInsertItems(rows, adminId, storeId) {
  const values = [];
  const params = [];

  rows.forEach((r, i) => {
    const base = i * 10;
    params.push(
      `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10})`
    );

    values.push(
      r.name,
      r.sku,
      r.barcode || null,
      Number(r.cost_price || 0),
      Number(r.wholesale_price || 0),
      Number(r.retail_price || 0),
      Number(r.quantity || 0),
      r.stock_unit || "pcs",
      r.selling_unit || "pcs",
      Number(r.units_per_package || 1)
    );
  });

  await query(
    `
    INSERT INTO items (
      name, sku, barcode,
      cost_price, wholesale_price, retail_price,
      quantity, stock_unit, selling_unit, units_per_package
    )
    VALUES ${params.join(",")}
    ON CONFLICT (sku, store_id) DO UPDATE SET
      quantity = EXCLUDED.quantity,
      retail_price = EXCLUDED.retail_price,
      wholesale_price = EXCLUDED.wholesale_price,
      cost_price = EXCLUDED.cost_price
    `,
    values
  );
}

const importItemsFromCSV = asyncHandler(async (req, res) => {
  const { adminId } = getTenant(req);
  const storeId = req.query.storeId;

  if (!storeId) {
    return res.status(400).json({ error: "storeId is required" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "CSV file is required" });
  }

  let batch = [];

  try {
    await pipeline(
      fs.createReadStream(req.file.path),
      csv(),
      async function* (source) {
        for await (const row of source) {
          batch.push(row);

          if (batch.length >= BATCH_SIZE) {
            await bulkInsertItems(batch, adminId, storeId);
            batch = [];
          }
        }

        if (batch.length) {
          await bulkInsertItems(batch, adminId, storeId);
        }
      }
    );

    res.json({
      success: true,
      message: "CSV imported successfully",
    });

  } finally {
    fs.unlink(req.file.path, () => {});
  }
});


module.exports = {
  getItems,
  getItemById,
  getItemByBarcode,
  createItem,
  updateItem,
  deleteItem,
  getWeeklyBestItems,
  createStockMovement,
  erpSync,
  processEdi850,
  importItemsFromCSV,
};
