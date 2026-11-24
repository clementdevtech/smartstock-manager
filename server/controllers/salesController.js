const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const db = require("../sqlite");
const { query } = require("../config/db");

const getTenant = (req) => ({
  adminId: req.user.adminId || req.user.id,
  storeId: req.user.storeId || "default-store",
});

const isOnline = async () => {
  try {
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
};

const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const parseSale = (sale) => ({
  ...sale,
  totalAmount: Number(sale.total),
  totalProfit: Number(sale.grossProfit || 0),
  items: JSON.parse(sale.items || "[]"),
});

async function resolveItem(itemId, tenant) {
  let item = db.get(
    `SELECT * FROM local_items
     WHERE (CAST(id AS TEXT) = ? OR postgres_id = ? OR sku = ?)
       AND storeId = ? AND adminId = ? AND deleted = 0
     LIMIT 1`,
    [String(itemId), String(itemId), String(itemId), tenant.storeId, tenant.adminId]
  );

  if (item || !(await isOnline())) return item;

  const remote = await query(
    `SELECT id, sku, name, retail_price, wholesale_price, quantity,
            low_stock_threshold, unit, deleted
     FROM items
     WHERE id::text = $1 AND admin_id::text = $2 AND store_id::text = $3
       AND COALESCE(deleted, false) = false
     LIMIT 1`,
    [String(itemId), String(tenant.adminId), String(tenant.storeId)]
  );

  if (!remote.rows.length) return null;

  const row = remote.rows[0];
  db.run(
    `INSERT INTO local_items (
       postgres_id, sku, name, category, cost_price, wholesale_price,
       retail_price, quantity, low_stock_threshold, stock_unit,
       adminId, storeId, syncStatus
     ) VALUES (?, ?, ?, 'other', ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
    [
      String(row.id), row.sku, row.name, Number(row.wholesale_price || 0),
      Number(row.wholesale_price || 0), Number(row.retail_price || 0),
      Number(row.quantity || 0), Number(row.low_stock_threshold || 5),
      row.unit || "pcs", tenant.adminId, tenant.storeId,
    ]
  );

  return db.get(
    `SELECT * FROM local_items WHERE postgres_id = ? AND storeId = ? AND adminId = ?`,
    [String(row.id), tenant.storeId, tenant.adminId]
  );
}

function saveSale(payload, tenant, cashierId) {
  const existing = db.get(
    `SELECT * FROM offline_sales WHERE saleId = ? AND adminId = ? AND storeId = ?`,
    [payload.saleId, tenant.adminId, tenant.storeId]
  );
  if (existing) return { sale: parseSale(existing), created: false };

  return db.transaction(() => {
    const duplicate = db.get(
      `SELECT * FROM offline_sales WHERE saleId = ? AND adminId = ? AND storeId = ?`,
      [payload.saleId, tenant.adminId, tenant.storeId]
    );
    if (duplicate) return { sale: parseSale(duplicate), created: false };

    const snapshots = [];
    for (const requested of payload.items) {
      const item = db.get(
        `SELECT * FROM local_items WHERE id = ? AND storeId = ? AND adminId = ? AND deleted = 0`,
        [requested.localId, tenant.storeId, tenant.adminId]
      );
      if (!item || Number(item.quantity) < requested.quantity) {
        throw Object.assign(new Error(`Insufficient stock for ${requested.name}`), { statusCode: 409 });
      }

      const unitPrice = money(item.retail_price);
      const costPrice = money(item.cost_price || item.wholesale_price || 0);
      if (unitPrice < 0 || costPrice < 0) {
        throw Object.assign(new Error(`Invalid price for ${item.name}`), { statusCode: 400 });
      }

      snapshots.push({
        itemId: item.postgres_id || String(item.id),
        localItemId: item.id,
        name: item.name,
        sku: item.sku,
        quantity: requested.quantity,
        unitPrice,
        costPrice,
        total: money(unitPrice * requested.quantity),
        totalCost: money(costPrice * requested.quantity),
      });
    }

    const subtotal = money(snapshots.reduce((sum, item) => sum + item.total, 0));
    const discountAmount = money(payload.discountAmount);
    if (discountAmount < 0 || discountAmount > subtotal) {
      throw Object.assign(new Error("Discount must be between zero and subtotal"), { statusCode: 400 });
    }
    const tax = money((subtotal - discountAmount) * payload.taxRate);
    const total = money(subtotal - discountAmount + tax);
    const costOfGoods = money(snapshots.reduce((sum, item) => sum + item.totalCost, 0));
    const grossProfit = money(subtotal - discountAmount - costOfGoods);
    const amountPaid = money(payload.amountPaid ?? (payload.paymentStatus === "credit" ? 0 : total));
    if (amountPaid < 0 || amountPaid > total) {
      throw Object.assign(new Error("Amount paid must be between zero and total"), { statusCode: 400 });
    }
    if (amountPaid < total && (!payload.customerName || payload.customerName === "Walk-in Customer")) {
      throw Object.assign(new Error("A customer name is required for unpaid balances"), { statusCode: 400 });
    }
    const paymentStatus = amountPaid >= total ? "paid" : amountPaid > 0 ? "partial" : "credit";
    const timestamp = new Date().toISOString();
    const receiptNo = `R-${payload.saleId.slice(0, 12).toUpperCase()}`;

    const result = db.run(
      `INSERT INTO offline_sales (
         saleId, receiptNo, items, subtotal, discountAmount, taxRate, tax,
         total, costOfGoods, grossProfit, currency, paymentType, paymentMethod,
         paymentStatus, amountPaid, customerName, cashierId, storeId, adminId,
         syncStatus, createdAt, updatedAt
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [
        payload.saleId, receiptNo, JSON.stringify(snapshots), subtotal,
        discountAmount, payload.taxRate, tax, total, costOfGoods, grossProfit,
        payload.currency, payload.paymentMethod, payload.paymentMethod,
        paymentStatus, amountPaid, payload.customerName, cashierId,
        tenant.storeId, tenant.adminId, timestamp, timestamp,
      ]
    );

    const saleId = result.lastInsertRowid;
    for (const item of snapshots) {
      db.run(
        `INSERT INTO sale_items (
           saleId, itemId, itemName, sku, quantity, unitPrice,
           costPrice, totalPrice, totalCost
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [saleId, item.localItemId, item.name, item.sku, item.quantity,
          item.unitPrice, item.costPrice, item.total, item.totalCost]
      );

      const changed = db.run(
        `UPDATE local_items
         SET quantity = quantity - ?, updatedAt = ?, syncStatus = 'pending'
         WHERE id = ? AND storeId = ? AND adminId = ? AND quantity >= ?`,
        [item.quantity, timestamp, item.localItemId, tenant.storeId,
          tenant.adminId, item.quantity]
      );
      if (changed.changes !== 1) {
        throw Object.assign(new Error(`Insufficient stock for ${item.name}`), { statusCode: 409 });
      }

      db.run(
        `INSERT INTO stock_movements (
           movementId, itemId, movementType, quantity, referenceId, notes,
           adminId, storeId, createdBy
         ) VALUES (?, ?, 'sale', ?, ?, ?, ?, ?, ?)`,
        [`${payload.saleId}:${item.localItemId}`, item.localItemId,
          -item.quantity, saleId, payload.saleId, tenant.adminId,
          tenant.storeId, cashierId]
      );
    }

    if (amountPaid > 0) {
      db.run(
        `INSERT INTO customer_receipts (id, saleId, amount, paymentMethod, storeId, adminId, createdBy)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), payload.saleId, amountPaid, payload.paymentMethod,
          tenant.storeId, tenant.adminId, cashierId]
      );
    }

    const sale = db.get("SELECT * FROM offline_sales WHERE id = ?", [saleId]);
    return { sale: parseSale(sale), created: true };
  });
}

const createSale = asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!Array.isArray(body.items) || body.items.length === 0) {
    res.status(400);
    throw new Error("No sale items provided");
  }

  const tenant = getTenant(req);
  if (!tenant.storeId || !tenant.adminId) {
    res.status(400);
    throw new Error("A store is required for checkout");
  }

  const saleId = body.saleId || crypto.randomUUID();
  if (!/^[0-9a-f-]{36}$/i.test(saleId)) {
    res.status(400);
    throw new Error("Sale ID must be a UUID");
  }
  const previousSale = db.get(
    `SELECT * FROM offline_sales WHERE saleId = ? AND adminId = ? AND storeId = ?`,
    [saleId, tenant.adminId, tenant.storeId]
  );
  if (previousSale) {
    return res.status(200).json({
      message: "Sale already recorded",
      ...parseSale(previousSale),
    });
  }

  const normalized = new Map();
  for (const row of body.items) {
    const itemId = row.itemId || row.id || row.sku;
    const quantity = Number(row.quantity ?? row.qty);
    if (!itemId || !Number.isFinite(quantity) || quantity <= 0) {
      res.status(400);
      throw new Error("Invalid sale item");
    }
    const key = String(itemId);
    normalized.set(key, (normalized.get(key) || 0) + quantity);
  }

  const resolvedItems = [];
  for (const [itemId, quantity] of normalized) {
    const item = await resolveItem(itemId, tenant);
    if (!item) {
      res.status(404);
      throw new Error(`Item not found: ${itemId}`);
    }
    resolvedItems.push({ localId: item.id, quantity, name: item.name });
  }

  const paymentMethod = String(body.paymentMethod || body.paymentType || "cash").toLowerCase();
  if (!["cash", "mpesa", "card", "bank", "credit", "other"].includes(paymentMethod)) {
    res.status(400);
    throw new Error("Unsupported payment method");
  }
  const taxRate = Number(body.taxRate ?? 0);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) {
    res.status(400);
    throw new Error("Tax rate must be between 0 and 1");
  }
  const currency = String(body.currency || "KES").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    res.status(400);
    throw new Error("Currency must be a three-letter code");
  }

  const result = saveSale({
    saleId,
    items: resolvedItems,
    discountAmount: Number(body.discountAmount || 0),
    taxRate,
    amountPaid: body.amountPaid == null ? undefined : Number(body.amountPaid),
    paymentStatus: body.paymentStatus,
    paymentMethod,
    currency,
    customerName: String(body.customerName || "Walk-in Customer").trim().slice(0, 160),
  }, tenant, req.user.id);

  res.status(result.created ? 201 : 200).json({
    message: result.created ? "Sale recorded" : "Sale already recorded",
    ...result.sale,
  });
});

/* =====================================================
   GET SALES
===================================================== */

const getSales = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);

  const sales = db.all(
    `SELECT * FROM offline_sales
     WHERE storeId = ? AND adminId = ? AND COALESCE(deleted, 0) = 0
     ORDER BY createdAt DESC`,
    [storeId, adminId]
  );
  res.json(sales.map(parseSale));
});

/* =====================================================
   GET SALE BY ID
===================================================== */

const getSaleById = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);

  const sale = db.get(
    `
    SELECT *
    FROM offline_sales
    WHERE id = ?
    AND storeId = ?
    AND adminId = ?
    AND deleted = 0
    `,
    [req.params.id, storeId, adminId]
  );

  if (!sale) {
    throw new Error("Sale not found");
  }

  res.json(parseSale(sale));
});

/* =====================================================
   DAILY SUMMARY
===================================================== */

const getDailySummary = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);

  const summary = await db.get(
    `
    SELECT 
      COUNT(*) AS transactions,
      COALESCE(SUM(total), 0) AS totalSales,
      COALESCE(SUM(grossProfit), 0) AS totalProfit,
      COALESCE(SUM(amountPaid), 0) AS amountCollected
    FROM offline_sales
    WHERE DATE(createdAt) = DATE('now')
    AND storeId = ?
    AND adminId = ?
    AND COALESCE(deleted, 0) = 0
    `,
    [storeId, adminId]
  );
  const items = db.get(
    `SELECT COALESCE(SUM(si.quantity), 0) AS itemsSold
     FROM sale_items si
     JOIN offline_sales s ON s.id = si.saleId
     WHERE DATE(s.createdAt) = DATE('now')
       AND s.storeId = ? AND s.adminId = ? AND COALESCE(s.deleted, 0) = 0`,
    [storeId, adminId]
  );

  res.json({
    date: new Date(),
    ...summary,
    ...items,
  });
});

const getReceivables = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);
  const rows = db.all(
    `SELECT saleId, receiptNo, customerName, total, amountPaid,
        total - amountPaid AS balance, currency, createdAt
     FROM offline_sales
     WHERE adminId = ? AND storeId = ? AND COALESCE(deleted, 0) = 0
       AND paymentStatus != 'paid' AND total > amountPaid
     ORDER BY createdAt ASC`,
    [adminId, storeId]
  );
  res.json(rows);
});

const addSaleReceipt = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);
  const receiptId = req.body.receiptId || crypto.randomUUID();
  const amount = money(req.body.amount);
  const paymentMethod = String(req.body.paymentMethod || "cash").toLowerCase();
  if (!/^[0-9a-f-]{36}$/i.test(receiptId) || !Number.isFinite(amount) || amount <= 0) {
    res.status(400);
    throw new Error("Provide a receipt UUID and positive payment amount");
  }
  if (!["cash", "mpesa", "card", "bank", "other"].includes(paymentMethod)) {
    res.status(400);
    throw new Error("Unsupported payment method");
  }

  const duplicate = db.get(
    `SELECT * FROM customer_receipts WHERE id = ? AND adminId = ? AND storeId = ?`,
    [receiptId, adminId, storeId]
  );
  if (duplicate) return res.json({ success: true, receipt: duplicate, replayed: true });

  const result = db.transaction(() => {
    const prior = db.get(
      `SELECT * FROM customer_receipts WHERE id = ? AND adminId = ? AND storeId = ?`,
      [receiptId, adminId, storeId]
    );
    if (prior) return { receipt: prior, replayed: true };

    const sale = db.get(
      `SELECT * FROM offline_sales WHERE saleId = ? AND adminId = ? AND storeId = ? AND COALESCE(deleted, 0) = 0`,
      [req.params.saleId, adminId, storeId]
    );
    if (!sale) throw Object.assign(new Error("Receivable sale not found"), { statusCode: 404 });
    const outstanding = money(Number(sale.total) - Number(sale.amountPaid || 0));
    if (amount > outstanding) {
      throw Object.assign(new Error(`Payment exceeds outstanding balance of ${outstanding}`), { statusCode: 400 });
    }

    db.run(
      `INSERT INTO customer_receipts (id, saleId, amount, paymentMethod, reference, storeId, adminId, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [receiptId, sale.saleId, amount, paymentMethod, req.body.reference || null,
        storeId, adminId, req.user.id]
    );
    const amountPaid = money(Number(sale.amountPaid || 0) + amount);
    db.run(
      `UPDATE offline_sales SET amountPaid = ?, paymentStatus = ?, syncStatus = 'pending',
        updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [amountPaid, amountPaid >= Number(sale.total) ? "paid" : "partial", sale.id]
    );
    return { receipt: db.get("SELECT * FROM customer_receipts WHERE id = ?", [receiptId]), replayed: false };
  });

  res.status(result.replayed ? 200 : 201).json({ success: true, ...result });
});

/* =====================================================
   DELETE SALE (SOFT DELETE)
===================================================== */

const deleteSale = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);

  const sale = db.get(
    `SELECT * FROM offline_sales WHERE id = ? AND storeId = ? AND adminId = ? AND COALESCE(deleted, 0) = 0`,
    [req.params.id, storeId, adminId]
  );
  if (!sale) {
    res.status(404);
    throw new Error("Sale not found");
  }

  db.transaction(() => {
    for (const item of JSON.parse(sale.items || "[]")) {
      db.run(
        `UPDATE local_items SET quantity = quantity + ?, syncStatus = 'pending', updatedAt = CURRENT_TIMESTAMP
         WHERE (postgres_id = ? OR CAST(id AS TEXT) = ?) AND storeId = ? AND adminId = ?`,
        [item.quantity, String(item.itemId), String(item.itemId), storeId, adminId]
      );
    }
    db.run(
      `UPDATE offline_sales SET deleted = 1, syncStatus = 'pending', updatedAt = CURRENT_TIMESTAMP
       WHERE id = ? AND storeId = ? AND adminId = ?`,
      [sale.id, storeId, adminId]
    );
  });

  res.json({
    message: "Sale deleted",
  });
});

/* =====================================================
   EXPORTS
===================================================== */

module.exports = {
  createSale,
  getSales,
  getSaleById,
  getDailySummary,
  getReceivables,
  addSaleReceipt,
  deleteSale,
};