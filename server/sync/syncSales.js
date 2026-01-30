/**
 * server/sync/syncSales.js
 * OFFLINE → ONLINE sales sync engine
 */

const axios = require("axios");
const db = require("../db/sqlite");

const API_URL = process.env.API_URL; // e.g https://api.smartstock.app
const SYNC_ENDPOINT = "/api/sales/sync";

/* =====================================================
   SYNC OFFLINE SALES
===================================================== */
async function syncOfflineSales(authToken) {
  if (!API_URL || !authToken) {
    console.log("⚠️ Sync skipped: missing API_URL or auth token");
    return;
  }

  // 1️⃣ Fetch pending sales
  const pendingSales = db.all(`
    SELECT * FROM offline_sales
    WHERE status = 'pending'
    ORDER BY createdAt ASC
  `);

  if (pendingSales.length === 0) {
    console.log("✅ No offline sales to sync");
    return;
  }

  console.log(`🔄 Syncing ${pendingSales.length} offline sale(s)...`);

  for (const sale of pendingSales) {
    try {
      const payload = {
        receiptNo: sale.receiptNo,
        items: JSON.parse(sale.items),
        subtotal: sale.subtotal,
        tax: sale.tax,
        total: sale.total,
        paymentType: sale.paymentType,
        paymentStatus: sale.paymentStatus,
        cashierId: sale.cashierId,
        storeId: sale.storeId,
        adminId: sale.adminId,
        createdAt: sale.createdAt,
      };

      // 2️⃣ Send to server
      const response = await axios.post(
        `${API_URL}${SYNC_ENDPOINT}`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
          timeout: 5000,
        }
      );

      // 3️⃣ Mark as synced locally
      db.run(
        `
        UPDATE offline_sales
        SET
          status = 'synced',
          syncedAt = CURRENT_TIMESTAMP,
          mongoId = ?
        WHERE id = ?
      `,
        [response.data._id, sale.id]
      );

      console.log(`✅ Sale synced: ${sale.receiptNo}`);
    } catch (err) {
      console.error(
        `❌ Failed to sync sale ${sale.receiptNo}:`,
        err.message
      );

      // ⚠️ Do NOT delete or mark failed — retry later
    }
  }
}

module.exports = syncOfflineSales;
