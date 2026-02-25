const API_BASE = import.meta.env.VITE_API_URL;

export const api = async (url, method = "GET", body) => {
  const token =
    localStorage.getItem("token") || sessionStorage.getItem("token");

  let res;

  // 🌐 NETWORK CHECK
  try {
    res = await fetch(`${API_BASE}${url}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // ❌ NO INTERNET
    return {
      offline: true,
      message: "No internet connection",
    };
  }

  const text = await res.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `Server returned invalid response (${res.status})`
    );
  }

  // 🟡 SERVICE DOWN (NOT OFFLINE)
  if (res.status === 503) {
    return {
      unavailable: true,
      message: data.message || "Service temporarily unavailable",
    };
  }

  // 🔴 REAL ERRORS
  if (!res.ok) {
    throw new Error(data.message || "API error");
  }

  return data;
};