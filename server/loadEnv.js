const fs = require("fs");
const path = require("path");
const os = require("os");
const dotenv = require("dotenv");

module.exports = function loadEnv() {
  // 1) If Electron explicitly injected ENV_PATH, use it
  if (process.env.ENV_PATH && fs.existsSync(process.env.ENV_PATH)) {
    dotenv.config({ path: process.env.ENV_PATH });
    console.log("🔐 Loaded env from ENV_PATH:", process.env.ENV_PATH);
    return;
  }

  // 2) Default: use a writable env file in APP_DATA
  const APP_DATA =
    process.env.APP_DATA || path.join(os.homedir(), ".smartstock");

  if (!fs.existsSync(APP_DATA)) {
    fs.mkdirSync(APP_DATA, { recursive: true });
  }

  const envPath = path.join(APP_DATA, ".env");

  // Create default env if missing
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(
      envPath,
      `# =====================================
# SUPABASE POSTGRES (PRIMARY DB)
# =====================================
DATABASE_URL=postgresql://postgres.ydxtxwtoenjqvkhggaxk:smartstockapplications@@aws-1-eu-west-1.pooler.supabase.com:6543/postgres

PGHOST=db.ydxtxwtoenjqvkhggaxk.supabase.co
PGPORT=6543
PGDATABASE=postgres
PGUSER=postgres.ydxtxwtoenjqvkhggaxk
PGPASSWORD=smartstockapplications@
PGSSLMODE=transaction

# =====================================
# OPTIONAL: SUPABASE PROJECT INFO
# (useful later for auth/storage)
# =====================================
SUPABASE_URL=https://ydxtxwtoenjqvkhggaxk.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# JWT SECRET
JWT_SECRET=ti8uuipoiujbhi6tf8uygi0oi0plop96y7u8y7u6y5t4r3e2w1qazxsw2edc3rfv4tgby5hnj6m7j8k9l0poiuytrewqasdfghjklzxcvbnm

#  SMTP CONFIGURATION
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=smartstockapplications@gmail.com
SMTP_PASS=hdca rhfj qrsl dlpq
RESEND_API_KEY=re_9ApzPjgs_J52ArSDqn9Pav4zm7LFmkUvS

# cloudinary config
CLOUDINARY_CLOUD_NAME=dnfsojfku
CLOUDINARY_API_KEY=354159982642477
CLOUDINARY_API_SECRET=KfRwVcknafSvI1toDokGDcdXcO8

NODE_ENV=production

PORT=3333
`
    );
    console.log("📝 Created default .env at:", envPath);
  }

  dotenv.config({ path: envPath });
  console.log("🔐 Loaded env from APP_DATA:", envPath);
};
