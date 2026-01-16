const API_BASE = import.meta.env.VITE_API_URL;

export const api = async (endpoint, method = "GET", data = null, auth = false) => {
  const headers = {
    "Content-Type": "application/json",
  };

  // Attach JWT on protected requests
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

  let json = {};

  try {
    json = await res.json();
  } catch {
    // Avoid crashing if body is empty
    json = {};
  }

  // ❌ DO NOT throw new Error("…") — it hides backend messages
  if (!res.ok) {
    const err = new Error(json.message || "Request failed");
    err.response = { data: json, status: res.status };
    throw err;
  }

  return json;
};
