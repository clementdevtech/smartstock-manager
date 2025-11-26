// controllers/keyController.js
// Replace with DB collection of keys
const productKeys = {
  // key -> { available: true/false, assignedTo: email|null }
  "ABCD1234EFGH5678": { available: true, assignedTo: null },
  "ZZZZ1111YYYY2222": { available: true, assignedTo: null },
};

exports.validateKey = async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ message: "Key required" });
  const item = productKeys[key];
  if (!item) return res.json({ valid: false });
  return res.json({ valid: item.available });
};

exports.assignKey = async (req, res) => {
  const { email, productKey } = req.body;
  if (!email || !productKey) return res.status(400).json({ message: "Missing" });

  const item = productKeys[productKey];
  if (!item || !item.available) return res.status(400).json({ message: "Key unavailable" });

  item.available = false;
  item.assignedTo = email;
  // save in DB in production
  return res.json({ success: true });
};
