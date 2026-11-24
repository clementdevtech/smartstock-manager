const { app, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");

const storeFile = path.join(app.getPath("userData"), "secure.json");

function ensureStoreFile() {
  if (!fs.existsSync(storeFile)) {
    fs.writeFileSync(storeFile, JSON.stringify({}, null, 2), "utf-8");
  }
}

function readStore() {
  ensureStoreFile();
  try {
    return JSON.parse(fs.readFileSync(storeFile, "utf-8"));
  } catch (error) {
    fs.writeFileSync(storeFile, JSON.stringify({}, null, 2), "utf-8");
    return {};
  }
}

function writeStore(data) {
  fs.writeFileSync(storeFile, JSON.stringify(data, null, 2), "utf-8");
}

function save(key, value) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Safe storage unavailable on this platform.");
  }

  const encrypted = safeStorage.encryptString(String(value));
  const data = readStore();
  data[key] = encrypted.toString("base64");
  writeStore(data);
}

function load(key) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Safe storage unavailable on this platform.");
  }

  const data = readStore();
  const record = data[key];
  if (!record) return null;

  const buffer = Buffer.from(record, "base64");
  return safeStorage.decryptString(buffer);
}

function remove(key) {
  const data = readStore();
  delete data[key];
  writeStore(data);
}

function getAll() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Safe storage unavailable on this platform.");
  }

  const data = readStore();
  const values = {};

  for (const [key, encryptedValue] of Object.entries(data)) {
    const buffer = Buffer.from(encryptedValue, "base64");
    values[key] = safeStorage.decryptString(buffer);
  }

  return values;
}

module.exports = { save, load, remove, getAll };
