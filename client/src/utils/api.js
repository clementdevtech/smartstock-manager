const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

export const api = async (endpoint, method = "GET", data = null, auth = false) => {
  const headers = {
    "Content-Type": "application/json"
  };

  // Attach JWT on protected endpoints
  if (auth) {
    const token = localStorage.getItem("token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: data ? JSON.stringify(data) : null,
    credentials: "include",
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Request failed");

  return json;
};
