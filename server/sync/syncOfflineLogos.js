const fs = require("fs");
const cloudinary = require("../config/cloudinary");
const db = require("../sqlite");
const { query } = require("../config/db");

async function syncOfflineLogos() {
  /* ================================
     ONLINE CHECK
  ================================= */
  try {
    await query("SELECT 1");
  } catch {
    console.log("⚠️ Supabase offline — logo sync skipped");
    return;
  }

  /* ================================
     FETCH PENDING LOGOS
  ================================= */
  let logos;

  try {
    logos = await db.all(`
      SELECT *
      FROM offline_logos
      WHERE syncStatus = 'pending'
      ORDER BY createdAt ASC
    `);
  } catch (err) {
    console.error("❌ Failed to read offline_logos:", err.message);
    return;
  }

  if (!logos.length) return;

  console.log(`🖼️ Syncing ${logos.length} logo(s)`);

  /* ================================
     PROCESS EACH LOGO
  ================================= */
  for (const logo of logos) {
    try {
      /* Upload to Cloudinary */
      const upload = await cloudinary.uploader.upload(
        logo.local_path,
        { folder: "smartstock/logos" }
      );

      /* Update Supabase */
      await query(
        `
        UPDATE users
        SET logo_url = $1
        WHERE name = $2
        `,
        [upload.secure_url, logo.store_name]
      );

      /* Mark as synced locally */
      await db.run(
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

      /* Delete local file safely */
      try {
        if (fs.existsSync(logo.local_path)) {
          fs.unlinkSync(logo.local_path);
        }
      } catch (fileErr) {
        console.warn("⚠️ Failed to delete local file:", fileErr.message);
      }

      console.log(`✅ Logo synced: ${logo.store_name}`);

    } catch (err) {
      console.error("❌ Logo sync failed:", err.message);
    }
  }
}

module.exports = syncOfflineLogos;