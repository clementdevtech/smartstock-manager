const nodemailer = require("nodemailer");

function hasSMTP() {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter = null;

if (hasSMTP()) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  transporter
    .verify()
    .then(() => console.log("📧 SMTP transporter ready"))
    .catch((err) => console.error("❌ SMTP transporter error:", err));
} else {
  console.log("⚠️ SMTP not configured — email disabled");
}

async function sendEmail(to, subject, html) {
  if (!transporter) {
    console.log("⚠️ Email skipped (SMTP not configured)");
    return null;
  }

  const info = await transporter.sendMail({
    from: `"SmartStock" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });

  console.log(`📩 Email sent to ${to}: ${info.messageId}`);
  return info;
}

module.exports = sendEmail;
