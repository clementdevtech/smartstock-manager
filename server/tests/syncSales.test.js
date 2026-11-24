const test = require("node:test");
const assert = require("node:assert/strict");
const syncOfflineSales = require("../sync/syncSales");

function makeStore() {
  const sale = {
    id: 1,
    saleId: "f6773c27-5a16-4bda-a91d-67b2bb8179cb",
    receiptNo: "R-F6773C275A16",
    items: JSON.stringify([{ itemId: "item-1", quantity: 2, unitPrice: 15, costPrice: 9 }]),
    subtotal: 30,
    discountAmount: 0,
    taxRate: 0,
    tax: 0,
    total: 30,
    costOfGoods: 18,
    grossProfit: 12,
    currency: "KES",
    paymentMethod: "mpesa",
    paymentStatus: "paid",
    amountPaid: 30,
    customerName: "Walk-in Customer",
    cashierId: "cashier-1",
    adminId: "admin-1",
    storeId: "store-1",
    createdAt: "2026-10-15T10:00:00.000Z",
    deleted: 0,
    retryCount: 0,
    syncStatus: "pending",
  };

  return {
    sale,
    database: {
      all() {
        return sale.syncStatus === "pending" && sale.retryCount < 5 ? [{ ...sale }] : [];
      },
      run(sql, params) {
        if (sql.includes("SET syncStatus = 'synced'")) {
          sale.syncStatus = "synced";
          sale.retryCount = 0;
          sale.postgresId = sale.saleId;
        } else {
          sale.retryCount = params[0];
          sale.syncStatus = params[1];
        }
      },
    },
  };
}

test("offline sales sync once after reconnect, including a lost cloud response", async () => {
  const { sale, database } = makeStore();
  const cloudSales = new Map();
  let online = false;
  let loseNextResponse = false;

  const queryFn = async (sql, params = []) => {
    if (sql === "SELECT 1") {
      if (!online) throw new Error("offline");
      return { rows: [{ ok: 1 }] };
    }
    if (sql.includes("CREATE TABLE IF NOT EXISTS smartstock_sales")) return { rows: [] };
    if (sql.includes("INSERT INTO smartstock_sales")) {
      if (!cloudSales.has(params[0])) cloudSales.set(params[0], params);
      if (loseNextResponse) {
        loseNextResponse = false;
        throw new Error("connection lost after commit");
      }
      return { rows: [] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  await syncOfflineSales({ database, queryFn });
  assert.equal(sale.syncStatus, "pending");
  assert.equal(cloudSales.size, 0);

  online = true;
  loseNextResponse = true;
  await syncOfflineSales({ database, queryFn });
  assert.equal(sale.syncStatus, "pending");
  assert.equal(sale.retryCount, 1);
  assert.equal(cloudSales.size, 1);

  await syncOfflineSales({ database, queryFn });
  assert.equal(sale.syncStatus, "synced");
  assert.equal(sale.postgresId, sale.saleId);
  assert.equal(cloudSales.size, 1);
  assert.equal(cloudSales.get(sale.saleId)[0], sale.saleId);
});