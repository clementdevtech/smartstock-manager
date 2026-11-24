const defaultQuery = (...args) => require("../config/db").query(...args);

const MAX_RETRIES = 5;

async function ensureCloudTable(queryFn) {
  await queryFn(`
    CREATE TABLE IF NOT EXISTS smartstock_sales (
      sale_id TEXT PRIMARY KEY,
      receipt_no TEXT NOT NULL,
      items JSONB NOT NULL,
      subtotal NUMERIC NOT NULL,
      discount_amount NUMERIC NOT NULL,
      tax_rate NUMERIC NOT NULL,
      tax NUMERIC NOT NULL,
      total NUMERIC NOT NULL,
      cost_of_goods NUMERIC NOT NULL,
      gross_profit NUMERIC NOT NULL,
      currency CHAR(3) NOT NULL,
      payment_method TEXT NOT NULL,
      payment_status TEXT NOT NULL,
      amount_paid NUMERIC NOT NULL,
      customer_name TEXT NOT NULL,
      cashier_id TEXT,
      admin_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      sale_date TIMESTAMPTZ NOT NULL,
      voided BOOLEAN NOT NULL DEFAULT FALSE,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function syncOfflineSales({ database, queryFn = defaultQuery } = {}) {
  try {
    await queryFn("SELECT 1");
    await ensureCloudTable(queryFn);
  } catch {
    return;
  }

  const localDb = database || require("../sqlite");
  const pending = localDb.all(`
    SELECT * FROM offline_sales
    WHERE syncStatus = 'pending'
      AND COALESCE(retryCount, 0) < ?
    ORDER BY createdAt ASC
    LIMIT 100
  `, [MAX_RETRIES]);

  for (const sale of pending) {
    try {
      const items = JSON.parse(sale.items || "[]");
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error("Sale has no valid item snapshots");
      }

      await queryFn(`
        INSERT INTO smartstock_sales (
          sale_id, receipt_no, items, subtotal, discount_amount, tax_rate, tax,
          total, cost_of_goods, gross_profit, currency, payment_method,
          payment_status, amount_paid, customer_name, cashier_id, admin_id,
          store_id, sale_date, voided
        ) VALUES (
          $1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
        )
        ON CONFLICT (sale_id) DO UPDATE SET voided = EXCLUDED.voided
      `, [
        sale.saleId, sale.receiptNo, JSON.stringify(items), sale.subtotal,
        sale.discountAmount, sale.taxRate, sale.tax, sale.total,
        sale.costOfGoods, sale.grossProfit, sale.currency, sale.paymentMethod,
        sale.paymentStatus, sale.amountPaid, sale.customerName, sale.cashierId,
        sale.adminId, sale.storeId, sale.createdAt, Boolean(sale.deleted),
      ]);

      localDb.run(`
        UPDATE offline_sales
        SET syncStatus = 'synced', syncedAt = CURRENT_TIMESTAMP,
            postgresId = saleId, retryCount = 0
        WHERE id = ?
      `, [sale.id]);
    } catch (err) {
      const retries = Number(sale.retryCount || 0) + 1;
      localDb.run(`
        UPDATE offline_sales
        SET retryCount = ?, syncStatus = ?
        WHERE id = ?
      `, [retries, retries >= MAX_RETRIES ? "failed" : "pending", sale.id]);
      console.error(`Sale sync failed for ${sale.saleId}:`, err.message);
    }
  }
}

module.exports = syncOfflineSales;