import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../utils/api";

const BusinessContext = createContext();

export const BusinessProvider = ({ children }) => {
  const [businessType, setBusinessType] = useState("retail");

  useEffect(() => {
    const loadSettings = async () => {
      const res = await api("/api/settings", "GET");
      setBusinessType(res.businessType || "retail");
    };
    loadSettings();
  }, []);

  return (
    <BusinessContext.Provider value={{ businessType, setBusinessType }}>
      {children}
    </BusinessContext.Provider>
  );
};

export const useBusiness = () => useContext(BusinessContext);
