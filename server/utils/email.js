const { Resend } = require("resend");

// Full debug: show env before initialization
console.log("🔍 RESEND_API_KEY loaded:", process.env.RESEND_API_KEY);

function hasResend() {
  return !!process.env.RESEND_API_KEY;
}

let resend = null;

if (hasResend()) {
  try {
    resend = new Resend(process.env.RESEND_API_KEY);
    console.log("📧 Resend email service ready");
  } catch (err) {
    console.error("❌ Failed to initialize Resend:", err);
  }
} else {
  console.log(
    "⚠️ RESEND_API_KEY not configured — email disabled",
    process.env.RESEND_API_KEY
  );
}

async function sendEmail(to, subject, html) {
  console.log("🛠 sendEmail called with:");
  console.log("  to:", to);
  console.log("  subject:", subject);
  console.log("  html length:", html.length);

  if (!resend) {
    console.log("⚠️ Email skipped (Resend not configured)");
    return null;
  }

  try {
    console.log("🌐 Sending email via Resend...");
    const response = await resend.emails.send({
      from: "SmartStock <noreply@netsafehub.com>",
      to,
      subject,
      html,
    });

    console.log("✅ Resend response received:", response.data);
    return response;
  } catch (err) {
    console.error("❌ Resend email error:", err);
    if (err.response) console.error("  API response:", err.response.data);
    throw err;
  }
}

module.exports = sendEmail;