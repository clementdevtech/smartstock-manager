const fs = require("fs");
const cloudinary = require("../config/cloudinary");
const db = require("../sqlite");
const { query } = require("../config/db");

async function syncOfflineLogos() {
  try {
    await query("SELECT 1");
  } catch {
    console.log("⚠️ Supabase offline — logo sync skipped");
    return;
  }

  const logos = db.all(`
    SELECT * FROM offline_logos
    WHERE syncStatus = 'pending'
    ORDER BY createdAt ASC
  `);

  if (!logos.length) return;

  console.log(`🖼️ Syncing ${logos.length} logo(s)`);

  for (const logo of logos) {
    try {
      const upload = await cloudinary.uploader.upload(
        logo.local_path,
        { folder: "smartstock/logos" }
      );

      await query(
        `
        UPDATE users
        SET logo_url = $1
        WHERE name = $2
        `,
        [upload.secure_url, logo.store_name]
      );

      db.run(
        `
        UPDATE offline_logos
        SET
          syncStatus = 'synced',
          syncedAt = CURRENT_TIMESTAMP,
          cloudinary_url = ?,
          cloudinary_public_id = ?
        WHERE id = ?
        `,
        [upload.secure_url, upload.public_id, logo.id]
      );

      fs.unlinkSync(logo.local_path);

      console.log(`✅ Logo synced: ${logo.store_name}`);
    } catch (err) {
      console.error("❌ Logo sync failed:", err.message);
    }
  }
}

module.exports = syncOfflineLogos;
