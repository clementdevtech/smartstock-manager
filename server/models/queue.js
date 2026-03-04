const Queue = require("bullmq").Queue;
const inventoryQueue = new Queue("inventory");

inventoryQueue.add("csv-import", { filePath, storeId, adminId });