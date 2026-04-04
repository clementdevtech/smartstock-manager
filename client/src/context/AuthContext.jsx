import { createContext, useEffect, useState } from "react";
import { api } from "../utils/api";

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  /**
   * 🔥 Restore user immediately from localStorage
   * prevents redirect flicker / POS auto-load
   */
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem("user");
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(true);

  /**
   * 🔐 Get token from either storage
   */
  const getToken = () =>
    localStorage.getItem("token") || sessionStorage.getItem("token");

  /**
   * 🔁 Restore authentication on app load
   */
  useEffect(() => {
    const restoreAuth = async () => {
      const token = getToken();

      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const res = await api("/api/auth/me", "GET");

        setUser(res);

        /* ⭐ Persist user */
        localStorage.setItem("user", JSON.stringify(res));

        /* ⭐ SAVE STORE ID */
        if (res.storeId) {
          localStorage.setItem("storeId", res.storeId);
        }

      } catch (err) {
        console.error("Auth restore failed:", err);

        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("storeId");
        sessionStorage.removeItem("token");

        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    restoreAuth();
  }, []);

  /**
   * ✅ Login handler
   */
  const loginUser = (userData) => {
    setUser(userData);

    localStorage.setItem("user", JSON.stringify(userData));

    /* ⭐ SAVE STORE */
    if (userData.storeId) {
      localStorage.setItem("storeId", userData.storeId);
    }
  };

  /**
   * 🚪 Logout handler
   */
  const logoutUser = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("storeId");
    sessionStorage.removeItem("token");

    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        loginUser,
        logoutUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};