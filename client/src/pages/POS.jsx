import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Printer,
  Search,
  ScanLine,
  Layers,
} from "lucide-react";
import Toast from "../components/Toast";
import { useReactToPrint } from "react-to-print";
import { api } from "../utils/api";
import CameraScanner from "../components/CameraScanner";

/* =====================================================
   OFFLINE PRODUCT CACHE (IndexedDB Wrapper)
===================================================== */
const productCache = {
  async save(products) {
    localStorage.setItem("offline_products", JSON.stringify(products));
  },
  async load() {
    return JSON.parse(localStorage.getItem("offline_products") || "[]");
  },
};

/* =====================================================
   ENTERPRISE BARCODE SCANNER (Multi-Lane Ready)
===================================================== */
const useEnterpriseScanner = (onScan) => {
  const buffer = useRef("");
  const lastTime = useRef(Date.now());

  useEffect(() => {
    const handler = (e) => {
      const now = Date.now();

      if (now - lastTime.current > 100) buffer.current = "";
      lastTime.current = now;

      if (e.key === "Enter") {
        if (buffer.current.length >= 6) {
          onScan(buffer.current.trim(), {
            source: "usb",
            confidence: 0.98,
          });
        }
        buffer.current = "";
        return;
      }

      if (/^[0-9A-Za-z\-]$/.test(e.key)) {
        buffer.current += e.key;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onScan]);
};

/* =====================================================
   POS COMPONENT
===================================================== */
const POS = () => {
  const [items, setItems] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [multiScanMode, setMultiScanMode] = useState(true);

  const [paymentType, setPaymentType] = useState("cash");
  const [customerCash, setCustomerCash] = useState("");
  const [scanScore, setScanScore] = useState(null);

  const receiptRef = useRef();
  const storeId = localStorage.getItem("storeId");

/* =====================================================
   FETCH INVENTORY (Offline-First)
===================================================== */
  const fetchItems = async () => {
    try {
      if (!navigator.onLine) {
        const offline = await productCache.load();
        setItems(offline);
        return;
      }

      const res = await api(`/api/items?storeId=${storeId}`, "GET");
      setItems(res);
      productCache.save(res);
    } catch {
      const offline = await productCache.load();
      setItems(offline);
      setToast({ message: "Offline mode active", type: "warning" });
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

/* =====================================================
   AI SMART BARCODE FALLBACK
===================================================== */
  const aiSmartMatch = (code) => {
    let bestMatch = null;
    let highestScore = 0;

    items.forEach((item) => {
      const score =
        item.barcode === code
          ? 1
          : item.sku === code
          ? 0.9
          : code.includes(item.sku || "")
          ? 0.7
          : 0;

      if (score > highestScore) {
        highestScore = score;
        bestMatch = item;
      }
    });

    return { bestMatch, score: highestScore };
  };

/* =====================================================
   ADD TO CART (Batch + Expiry Aware)
===================================================== */
  const addToCart = (item, qty = 1, batchMeta = {}) => {
    if (item.quantity < qty) {
      setToast({ message: "Insufficient stock", type: "error" });
      return;
    }

    const cartId = `${item.id}-${batchMeta.lot || "standard"}`;

    setCart((prev) => {
      const found = prev.find((c) => c.cartId === cartId);
      if (found) {
        return prev.map((c) =>
          c.cartId === cartId
            ? { ...c, qty: c.qty + qty }
            : c
        );
      }

      return [
        ...prev,
        {
          ...item,
          cartId,
          qty,
          lot: batchMeta.lot,
          expiry: batchMeta.expiry,
        },
      ];
    });
  };

/* =====================================================
   SCAN HANDLER (Enterprise Logic)
===================================================== */
  const handleScan = useCallback(
    async (code, meta = { confidence: 0.5 }) => {
      const { bestMatch, score } = aiSmartMatch(code);

      setScanScore(score);

      if (bestMatch && score > 0.6) {
        addToCart(bestMatch, 1, meta.batch || {});
        setToast({
          message: `Added ${bestMatch.name}`,
          type: score > 0.9 ? "success" : "warning",
        });
      } else {
        setToast({
          message: `Unknown barcode (${(score * 100).toFixed(0)}%)`,
          type: "error",
        });
      }
    },
    [items]
  );

  useEnterpriseScanner(handleScan);

/* =====================================================
   TOTALS
===================================================== */
  const subTotal = cart.reduce(
    (s, i) => s + i.qty * i.retailPrice,
    0
  );
  const tax = subTotal * 0.16;
  const total = subTotal + tax;
  const change =
    paymentType === "cash"
      ? Number(customerCash || 0) - total
      : 0;

/* =====================================================
   CHECKOUT (Warehouse + Pharmacy Safe)
===================================================== */
  const handleCheckout = async () => {
    if (!cart.length) {
      setToast({ message: "Cart empty", type: "error" });
      return;
    }

    const payload = {
      storeId,
      items: cart,
      total,
      paymentType,
      mode: multiScanMode ? "multi-lane" : "single",
    };

    try {
      if (!navigator.onLine) {
        window.electron?.ipcRenderer.send(
          "offline:add-sale",
          payload
        );
        setToast({ message: "Saved offline", type: "warning" });
      } else {
        await api("/api/sales", "POST", payload);
      }

      setCart([]);
      setCustomerCash("");
      fetchItems();
      setToast({ message: "Sale completed", type: "success" });
    } catch {
      setToast({ message: "Checkout failed", type: "error" });
    }
  };

/* =====================================================
   PRINT
===================================================== */
  const handlePrint = useReactToPrint({
    content: () => receiptRef.current,
    documentTitle: "Enterprise Receipt",
  });

/* =====================================================
   FILTER
===================================================== */
  const filteredItems = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

/* =====================================================
   UI
===================================================== */
  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <ShoppingCart className="text-blue-600" />
        Enterprise POS
      </h1>

      <div className="flex gap-2">
        <Search size={18} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search or Scan..."
          className="w-full p-2 border rounded-md"
        />
        <ScanLine
          className="text-blue-600 cursor-pointer"
          onClick={() => setShowScanner(true)}
        />
        <Layers
          className={`cursor-pointer ${
            multiScanMode ? "text-green-600" : ""
          }`}
          onClick={() => setMultiScanMode(!multiScanMode)}
        />
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 grid grid-cols-3 gap-3">
          {filteredItems.map((i) => (
            <div
              key={i.id}
              onClick={() => addToCart(i)}
              className="border p-3 rounded-lg cursor-pointer hover:bg-blue-50"
            >
              <h3 className="font-medium">{i.name}</h3>
              <p className="text-blue-600 font-semibold">
                ksh{i.retailPrice}
              </p>
            </div>
          ))}
        </div>

        <div className="border p-4 rounded-xl">
          <h2 className="font-semibold mb-3">
            Cart ({cart.length})
          </h2>

          {cart.map((i) => (
            <div key={i.cartId}
              className="flex justify-between py-1"
            >
              <span>
                {i.name} × {i.qty}
              </span>
              <span>
                ksh{(i.qty * i.retailPrice).toFixed(2)}
              </span>
            </div>
          ))}

          <div className="border-t mt-3 pt-3 text-sm">
            <div className="flex justify-between">
              <span>Total</span>
              <span>ksh{total.toFixed(2)}</span>
            </div>
            {scanScore !== null && (
              <div className="text-xs text-gray-500">
                Scan confidence: {(scanScore * 100).toFixed(0)}%
              </div>
            )}
          </div>

          <button
            onClick={handleCheckout}
            className="w-full mt-4 bg-blue-600 text-white py-2 rounded-lg"
          >
            Complete Sale
          </button>

          <button
            onClick={handlePrint}
            className="w-full mt-2 bg-gray-700 text-white py-2 rounded-lg flex justify-center gap-2"
          >
            <Printer size={18} />
            Print
          </button>
        </div>
      </div>

      {showScanner && (
        <CameraScanner
          continuous
          enterpriseMode
          onDetected={(code, meta) =>
            handleScan(code, {
              confidence: meta?.confidence || 0.85,
              batch: meta?.batch,
            })
          }
        />
      )}

      <div className="hidden">
        <div ref={receiptRef} className="p-4 w-72 text-sm">
          <h2 className="text-center font-bold">
            Enterprise SmartStock
          </h2>
          <hr />
          {cart.map((i) => (
            <div key={i.cartId}
              className="flex justify-between"
            >
              <span>
                {i.name} × {i.qty}
              </span>
              <span>
                ksh{(i.qty * i.retailPrice).toFixed(2)}
              </span>
            </div>
          ))}
          <hr />
          <div className="font-bold text-right">
            Total: ksh{total.toFixed(2)}
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <Toast {...toast} onClose={() => setToast(null)} />
        </div>
      )}
    </div>
  );
};

export default POS;