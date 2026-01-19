import { api } from "../utils/api";

export const getBusinessInfo = () =>
  api("/api/settings/business", "GET");

export const updateBusinessInfo = (data) =>
  api("/api/settings/business", "PUT", data);
