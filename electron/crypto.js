const crypto = require("crypto");

const SECRET = crypto
  .createHash("sha256")
  .update("SmartStock-Internal-Secret")
  .digest();

function encrypt(data) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", SECRET, iv);
  let encrypted = cipher.update(JSON.stringify(data));
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(payload) {
  const [ivHex, dataHex] = payload.split(":");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    SECRET,
    Buffer.from(ivHex, "hex")
  );
  let decrypted = decipher.update(Buffer.from(dataHex, "hex"));
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return JSON.parse(decrypted.toString());
}

module.exports = { encrypt, decrypt };
