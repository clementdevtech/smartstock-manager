import { api } from "../utils/api";

// ✔ Send verification email
export const sendVerificationEmail = async (email) => {
  return await api("/api/auth/send-verification-email", "POST", { email });
};

// ✔ Resend verification code (reuses same endpoint)
export const resendCode = async (email) => {
  return await api("/api/auth/send-verification-email", "POST", { email });
};

// ✔ Verify email code
export const verifyEmailCode = async (email, code) => {
  return await api("/api/auth/verify-email-code", "POST", { email, code });
};

// ✔ Check if email exists  (correct route = GET)
export const checkEmailExists = async (email) => {
  return await api(`/api/auth/check-email?email=${encodeURIComponent(email)}`, "GET");
};

// ✔ Validate product key  (GET is correct)
export const validateProductKey = async (key) => {
  return await api(`/api/auth/validate-key?productKey=${encodeURIComponent(key)}`, "GET");
};

// ✔ Assign product key
export const assignProductKeyToEmail = async ({ email, productKey }) => {
  return await api("/api/auth/assign-key", "POST", { email, productKey });
};

// ✔ Upload store logo
export const uploadLogo = async (file) => {
  const form = new FormData();
  form.append("file", file);

  const API_BASE = import.meta.env.VITE_API_URL;
  const res = await fetch(`${API_BASE}/api/upload/logo`, {
    method: "POST",
    body: form,
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Upload failed");
  return json;
};

// ✔ Register user
export const register = async (payload) => {
  return await api("/api/auth/register", "POST", payload);
};

// ✔ Validate invite code  (should be GET)
export const validateInviteCode = async (code) => {
  return await api(`/api/auth/validate-invite?code=${encodeURIComponent(code)}`, "GET");
};

// ✔ Login user
export const login = async (email, password) => {
  return await api("/api/auth/login", "POST", { email, password });
};
