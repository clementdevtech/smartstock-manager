// services/authService.js
import { api } from "../utils/api";

// Send verification code to email (server should save code & expire)
export const sendVerificationEmail = async (email) => {
  const res = await api("/api/auth/send-verification", "POST", { email });
  return res;
};

// Verify the code
export const verifyEmailCode = async (email, code) => {
  const res = await api("/api/auth/verify-code", "POST", { email, code });
  return res; // { verified: true }
};

// Check if email exists (used to show warning)
export const checkEmailExists = async (email) => {
  const res = await api("/api/auth/check-email", "POST", { email });
  return res; // { exists: boolean }
};

// Validate product key (server checks DB)
export const validateProductKey = async (key) => {
  const res = await api("/api/keys/validate", "POST", { key });
  return res; // { valid: true/false }
};

// Assign product key to an email/user when email verified
export const assignProductKeyToEmail = async ({ email, productKey }) => {
  const res = await api("/api/keys/assign", "POST", { email, productKey });
  return res; // { success: true }
};

// Upload logo file (multipart)
export const uploadLogo = async (file) => {
  // Use formdata and a different endpoint that accepts multipart
  const form = new FormData();
  form.append("file", file);

  // Use fetch directly because api() sets Content-Type JSON
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";
  const res = await fetch(`${API_BASE}/api/upload/logo`, {
    method: "POST",
    body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Upload failed");
  return json; // { url: "https://..." }
};

// Final registration
export const register = async (payload) => {
  const res = await api("/api/auth/register", "POST", payload);
  return res; // { user, token, productKey? }
};

// invite code validation
export const validateInviteCode = async (code) => {
  const res = await api("/api/auth/validate-invite", "POST", { code });
  return res; // { valid: true/false }
};
