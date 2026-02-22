const { app, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");

const storeFile = path.join(app.getPath("userData"), "secure.json");

function save(key, value) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Safe storage unavailable on this platform.");
  }

  const encrypted = safeStorage.encryptString(value);

  let data = {};
  if (fs.existsSync(storeFile)) {
    data = JSON.parse(fs.readFileSync(storeFile, "utf-8"));
  }

  data[key] = encrypted.toString("base64");
  fs.writeFileSync(storeFile, JSON.stringify(data, null, 2), "utf-8");
}

function load(key) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Safe storage unavailable on this platform.");
  }

  if (!fs.existsSync(storeFile)) return null;

  const data = JSON.parse(fs.readFileSync(storeFile, "utf-8"));
  if (!data[key]) return null;

  const buffer = Buffer.from(data[key], "base64");
  return safeStorage.decryptString(buffer);
}

module.exports = { save, load };
