const nodemailer = require("nodemailer");
require('dotenv').config();

// Configure transporter with environment variables
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
  secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Verify transporter connection
transporter.verify()
  .then(() => console.log("📧 SMTP transporter ready"))
  .catch((err) => console.error("❌ SMTP transporter error:", err));


async function sendEmail(to, subject, html) {
  try {
    const info = await transporter.sendMail({
      from: `"SmartStock" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`📩 Email sent to ${to}: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error("❌ Failed to send email:", err);
    throw err;
  }
}

module.exports = sendEmail;
