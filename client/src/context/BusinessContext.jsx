import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../utils/api";
import { AuthContext } from "./AuthContext";

const BusinessContext = createContext();

export const BusinessProvider = ({ children }) => {
  const [businessType, setBusinessType] = useState("retail");
  const { user, loading } = useContext(AuthContext);

  useEffect(() => {
    const loadSettings = async () => {
      if (!user) return;

      try {
        const res = await api("/api/settings", "GET");
        setBusinessType(res.businessType || "retail");
      } catch (err) {
        console.warn("Settings load skipped:", err.message);
      }
    };

    if (!loading) {
      loadSettings();
    }
  }, [user, loading]);

  return (
    <BusinessContext.Provider value={{ businessType, setBusinessType }}>
      {children}
    </BusinessContext.Provider>
  );
};

export const useBusiness = () => useContext(BusinessContext);