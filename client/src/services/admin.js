import { api } from "../utils/api";

export const createUser = (data) =>
  api.post("/api/admin/users", data).then(res => res.data);

export const getUsers = () =>
  api.get("/api/admin/users").then(res => res.data);

export const resetUserPassword = (email, password) =>
  api.post("/api/admin/reset-password", { email, password });
