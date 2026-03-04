const csv = require("csv-parser");
const fs = require("fs");
const { pipeline } = require("stream/promises");

const BATCH_SIZE = 500;

async function bulkInsertItems(rows, adminId, storeId) {
  const values = [];
  const params = [];

  rows.forEach((r, i) => {
    const base = i * 7;
    params.push(
      `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, $${base+7})`
    );
    values.push(
      r.name,
      r.sku,
      r.barcode,
      r.quantity,
      r.wholesale_price,
      r.retail_price,
      storeId
    );
  });

  await query(`
    INSERT INTO items (name, sku, barcode, quantity, wholesale_price, retail_price, store_id)
    VALUES ${params.join(",")}
    ON CONFLICT (sku, store_id) DO UPDATE SET
      quantity = EXCLUDED.quantity,
      retail_price = EXCLUDED.retail_price,
      wholesale_price = EXCLUDED.wholesale_price
  `, values);
}

router.post("/api/items/import/csv", upload.single("file"), asyncHandler(async (req, res) => {
  const { adminId } = getTenant(req);
  const storeId = req.query.storeId;

  let batch = [];

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
      if (batch.length) await bulkInsertItems(batch, adminId, storeId);
    }
  );

  res.json({ success: true, message: "CSV imported successfully" });
}));