const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

module.exports = function loadEnv() {
  const isElectron =
    !!process.versions.electron ||
    process.argv.some(a => a.includes("electron"));

  let envPath = path.join(process.cwd(), ".env");

  if (isElectron && process.resourcesPath) {
    const electronEnv = path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "server",
      ".env"
    );

    if (fs.existsSync(electronEnv)) {
      envPath = electronEnv;
    }
  }

  dotenv.config({ path: envPath });

  // 🔐 SAFE FALLBACKS (CRITICAL)
  process.env.JWT_SECRET ||= "smartstock-dev-secret";
  process.env.NODE_ENV ||= "production";

  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI missing");
    process.exit(1);
  }

  console.log("📄 ENV loaded from:", envPath);
};
