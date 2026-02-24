const API_BASE = import.meta.env.VITE_API_URL;

export const api = async (url, method = "GET", body) => {
  const token =
    localStorage.getItem("token") || sessionStorage.getItem("token");

  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `Server returned invalid response (${res.status}). Backend reachable?`
    );
  }

  // 🟡 OFFLINE / REPORTS UNAVAILABLE
  if (res.status === 503) {
    return {
      offline: true,
      message: data.message || "Reports unavailable (offline mode)",
    };
  }

  // 🔴 REAL ERRORS
  if (!res.ok) {
    throw new Error(data.message || "API error");
  }

  return data;
};