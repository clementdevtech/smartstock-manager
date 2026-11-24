const fs = require("fs");
const crypto = require("crypto");
const dotenv = require("dotenv");

const ENV_ALIASES = {
  JWT_SECRET: ["SMARTSTOCK_JWT_SECRET", "JWT_SECRET"],
  DATABASE_URL: ["SMARTSTOCK_DATABASE_URL", "DATABASE_URL"],
  CLIENT_ORIGIN: ["SMARTSTOCK_CLIENT_ORIGIN", "CLIENT_ORIGIN"],
  CLOUDINARY_CLOUD_NAME: ["SMARTSTOCK_CLOUDINARY_CLOUD_NAME", "CLOUDINARY_CLOUD_NAME"],
  CLOUDINARY_API_KEY: ["SMARTSTOCK_CLOUDINARY_API_KEY", "CLOUDINARY_API_KEY"],
  CLOUDINARY_API_SECRET: ["SMARTSTOCK_CLOUDINARY_API_SECRET", "CLOUDINARY_API_SECRET"],
  ZOHO_ACCOUNTS_HOST: ["ZOHO_ACCOUNTS_HOST"],
  ZOHO_CLIENT_ID: ["ZOHO_CLIENT_ID"],
  ZOHO_CLIENT_SECRET: ["ZOHO_CLIENT_SECRET"],
  ZOHO_FROM: ["ZOHO_FROM"],
  ZOHO_MAIL_HOST: ["ZOHO_MAIL_HOST"],
  ZOHO_REDIRECT_URI: ["ZOHO_REDIRECT_URI"],
  ZOHO_REFRESH_TOKEN: ["ZOHO_REFRESH_TOKEN"],
  POSTGRES_ONLINE: ["SMARTSTOCK_POSTGRES_ONLINE", "POSTGRES_ONLINE"],
  PGSSL: ["SMARTSTOCK_PGSSL", "PGSSL"],
  PGSSL_REJECT_UNAUTHORIZED: ["SMARTSTOCK_PGSSL_REJECT_UNAUTHORIZED", "PGSSL_REJECT_UNAUTHORIZED"],
};

function pickFirst(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }
  return null;
}

function applyAliases() {
  for (const [targetKey, sourceKeys] of Object.entries(ENV_ALIASES)) {
    const value = pickFirst(...sourceKeys);
    if (value !== null) {
      process.env[targetKey] = value;
    }
  }
}

module.exports = function loadEnv() {
  const explicitEnvPath = process.env.SMARTSTOCK_ENV_PATH || process.env.ENV_PATH;
  if (explicitEnvPath) {
    if (!fs.existsSync(explicitEnvPath)) {
      throw new Error(`Configured env file not found: ${explicitEnvPath}`);
    }
    dotenv.config({ path: explicitEnvPath });
  }

  applyAliases();

  const isElectron = process.env.ELECTRON_RUN === "true";
  const jwtSecret = pickFirst("SMARTSTOCK_JWT_SECRET", "JWT_SECRET");

  if (!jwtSecret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Missing JWT_SECRET. Configure SMARTSTOCK_JWT_SECRET in the OS keychain or deployment secret manager before starting the app."
      );
    }

    if (isElectron) {
      throw new Error(
        "Missing JWT_SECRET in Electron secure storage. Set SMARTSTOCK_JWT_SECRET in the OS keychain before launching the desktop app."
      );
    }

    process.env.JWT_SECRET = crypto.randomBytes(48).toString("base64url");
    console.warn("⚠️ JWT_SECRET missing in development; generated ephemeral secret.");
  }
};
