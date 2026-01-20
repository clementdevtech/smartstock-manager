import { api } from "../utils/api";

/**
 * 👤 Create new user (ADMIN)
 */
export const createUser = async (data) => {
  return await api("/api/admin/users", "POST", data);
};

/**
 * 📋 Get all users (ADMIN)
 */
export const getUsers = async () => {
  return await api("/api/admin/users", "GET");
};

/**
 * 🔑 Reset user password (ADMIN)
 * Admin always sees & sets password
 */
export const resetUserPassword = async (email, password) => {
  return await api("/api/admin/reset-password", "POST", {
    email,
    password,
  });
};
