const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

module.exports = function loadEnv() {
  // Allows Electron to inject .env path
  const envPath = process.env.ENV_PATH;

  if (envPath && fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log("🔐 Loaded env from:", envPath);
  } else {
    dotenv.config();
    console.log("🔐 Loaded env from default location");
  }
};
