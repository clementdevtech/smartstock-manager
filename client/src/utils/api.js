export const api = async (url, method = "GET", body) => {
  const token =
    localStorage.getItem("token") || sessionStorage.getItem("token");

  const res = await fetch(
    `${import.meta.env.VITE_API_URL}${url}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body ? JSON.stringify(body) : undefined,
    }
  );

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "API error");
  }

  return data;
};
