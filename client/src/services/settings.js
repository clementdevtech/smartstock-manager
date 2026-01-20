import { api } from "../utils/api";

export const changePassword = async (currentPassword, newPassword) => {
  return await api("/api/settings/change-password", "POST", {
    currentPassword,
    newPassword,
  });
};

export const getBusinessInfo = () =>
  api("/api/settings/business", "GET");

export const updateBusinessInfo = (data) =>
  api("/api/settings/business", "PUT", data);
