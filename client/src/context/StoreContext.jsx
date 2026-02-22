import { createContext, useContext, useState, useEffect } from "react";
import { api } from "../utils/api";

const StoreContext = createContext();

export const StoreProvider = ({ children }) => {
  const [currentStore, setCurrentStore] = useState(null);
  const [stores, setStores] = useState([]);

  useEffect(() => {
    const loadStores = async () => {
      const res = await api("/api/stores", "GET");
      setStores(res || []);
      if (res?.length) setCurrentStore(res[0]);
    };
    loadStores();
  }, []);

  return (
    <StoreContext.Provider
      value={{ stores, currentStore, setCurrentStore }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => useContext(StoreContext);
