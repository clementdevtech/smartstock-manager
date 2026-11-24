const API_BASE = window.electronAPI?.isDesktop
  ? "http://127.0.0.1:3333"
  : import.meta.env.VITE_API_URL || "";

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
    throw new Error("SmartStock server is unreachable. Your data was not submitted; retry when the server is available.");
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
    throw new Error(data.message || "Service temporarily unavailable");
  }

  // 🔴 REAL ERRORS
  if (!res.ok) {
    throw new Error(data.message || "API error");
  }

  return data;
};

export const sendScan = async (code,data={}) => {

  try{

    await fetch("/api/scans",{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        code,
        ...data
      })
    });

  }catch(e){
    console.error("API error",e);
  }

};