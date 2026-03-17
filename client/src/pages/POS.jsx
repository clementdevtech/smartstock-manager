import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo
} from "react";

import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Printer,
  Search,
  ScanLine,
  Layers
} from "lucide-react";

import Toast from "../components/Toast";
import { useReactToPrint } from "react-to-print";
import { api } from "../utils/api";
import CameraScanner from "../components/CameraScanner";

/* =====================================================
   OFFLINE PRODUCT CACHE
===================================================== */

const productCache = {
  async save(products) {
    localStorage.setItem("offline_products", JSON.stringify(products));
  },

  async load() {
    return JSON.parse(localStorage.getItem("offline_products") || "[]");
  }
};

/* =====================================================
   USB BARCODE SCANNER HOOK
===================================================== */

const useEnterpriseScanner = (onScan) => {
  const buffer = useRef("");
  const lastTime = useRef(Date.now());

  useEffect(() => {

    const handler = (e) => {

      const now = Date.now();

      if (now - lastTime.current > 100)
        buffer.current = "";

      lastTime.current = now;

      if (e.key === "Enter") {

        if (buffer.current.length >= 6) {

          onScan(buffer.current.trim(), {
            source: "usb",
            confidence: 0.98
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

    return () =>
      window.removeEventListener("keydown", handler);

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
     FETCH INVENTORY
  ===================================================== */

 const normalizeItem = (i) => ({
  ...i,

  /* PRICE NORMALIZATION */
  retailPrice: Number(i.retail_price ?? i.retailPrice ?? 0),
  wholesalePrice: Number(i.wholesale_price ?? i.wholesalePrice ?? 0),
  costPrice: Number(i.cost_price ?? i.costPrice ?? 0),

  /* STOCK */
  quantity: Number(i.quantity ?? 0),

  /* SALE RULES */
  minSaleQty: Number(i.min_sale_qty ?? i.minSaleQty ?? 1),
  saleStep: Number(i.sale_step ?? i.saleStep ?? 1),

  /* UNIT SYSTEM */
  unitsPerPackage: Number(i.units_per_package ?? i.unitsPerPackage ?? 1),

  stockUnit: i.stock_unit ?? i.stockUnit ?? "pcs",
  sellingUnit: i.selling_unit ?? i.sellingUnit ?? "pcs",
  packageUnit: i.package_unit ?? i.packageUnit ?? null,
});

const fetchItems = async () => {
  try {

    /* ===============================
       OFFLINE MODE
    ============================== */
    if (!navigator.onLine) {
      const offline = await productCache.load();

      const normalizedOffline = offline.map(normalizeItem);

      setItems(normalizedOffline);

      return;
    }

    /* ===============================
       ONLINE FETCH
    ============================== */
    const res = await api(`/api/items?storeId=${storeId}`, "GET");

    const normalized = res.map(normalizeItem);

    setItems(normalized);

    /* ===============================
       CACHE (FRONTEND)
    ============================== */
    await productCache.save(normalized);

    /* ===============================
       🔥 SYNC TO SQLITE (CRITICAL FIX)
    ============================== */
    try {
      await window.electron?.ipcRenderer.invoke(
        "sync:items",
        normalized
      );
    } catch (syncErr) {
      console.warn("⚠️ SQLite sync failed:", syncErr);
    }

  } catch (err) {

    console.error("Fetch items error:", err);

    /* ===============================
       FALLBACK TO CACHE
    ============================== */
    const offline = await productCache.load();

    setItems(offline.map(normalizeItem));

    setToast({
      message: "Offline mode active",
      type: "warning"
    });

  }
};

  useEffect(() => {
    fetchItems();
  }, []);

  /* =====================================================
     ⚡ INSTANT BARCODE INDEX (10x FASTER)
  ===================================================== */

  const barcodeIndex = useMemo(() => {

  const map = new Map();

  items.forEach((item) => {

    if (item.barcode)
      map.set(item.barcode, item);

    if (item.sku)
      map.set(item.sku, item);

  });

  return map;

}, [items]);

  /* =====================================================
     SMART BARCODE MATCH
  ===================================================== */

  const aiSmartMatch = (code) => {

    const exact = barcodeIndex.get(code);

    if (exact)
      return { bestMatch: exact, score: 1 };

    for (const item of items) {

      if (item.sku && code.includes(item.sku)) {

        return {
          bestMatch: item,
          score: 0.7
        };

      }

    }

    return { bestMatch: null, score: 0 };

  };

  /* =====================================================
     ADD TO CART
  ===================================================== */

const addToCart = (item, qty = null) => {

  const minQty = Number(item.minSaleQty || 1);
  const step = Number(item.saleStep || 1);

  /* Default qty */
  if (qty === null) qty = minQty;

  /* Enforce minimum */
  if (qty < minQty) qty = minQty;

  /* Enforce multiples */
  if (qty % step !== 0) {
    qty = Math.ceil(qty / step) * step;
  }

  /* Stock validation */
  if (item.quantity < qty) {

    setToast({
      message: "Insufficient stock",
      type: "error"
    });

    return;
  }

  const cartId = item.id;

  setCart((prev) => {

    const found = prev.find(
      (c) => c.cartId === cartId
    );

    if (found) {

      let newQty = found.qty + qty;

      /* Enforce step when increasing */
      if (newQty % step !== 0) {
        newQty = Math.ceil(newQty / step) * step;
      }

      /* Stock protection */
      if (newQty > item.quantity) {

        setToast({
          message: "Stock limit reached",
          type: "warning"
        });

        return prev;
      }

      return prev.map((c) =>
        c.cartId === cartId
          ? { ...c, qty: newQty }
          : c
      );

    }

    return [
      ...prev,
      {
        ...item,
        cartId,
        qty
      }
    ];

  });

};

  /* =====================================================
     CART CONTROLS
  ===================================================== */

  const updateQty = (cartId, delta) => {

    setCart((prev) =>
      prev.map((i) =>
        i.cartId === cartId
          ? {
              ...i,
              qty: Math.max(1, i.qty + delta)
            }
          : i
      )
    );

  };

  const removeItem = (cartId) => {

    setCart((prev) =>
      prev.filter((i) => i.cartId !== cartId)
    );

  };

  /* =====================================================
     SCAN HANDLER
  ===================================================== */

  const handleScan = useCallback(

    async (raw, meta = {}) => {

      const code =
        typeof raw === "string"
          ? raw
          : raw?.code ||
            raw?.barcode ||
            raw?.sku ||
            "";

      if (!code) return;

      const { bestMatch, score } =
        aiSmartMatch(code);

      setScanScore(score);

      if (bestMatch && score > 0.6) {

        addToCart(bestMatch);

        navigator.vibrate?.(40);

        new Audio("/beep.mp3")
          .play()
          .catch(() => {});

        setToast({
          message: `Added ${bestMatch.name}`,
          type:
            score > 0.9
              ? "success"
              : "warning"
        });

      } else {

        setToast({
          message: "Unknown barcode",
          type: "error"
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
  const total = subTotal;
  const base = total - tax;

  const change =
    paymentType === "cash"
      ? Number(customerCash || 0) - total
      : 0;

  /* =====================================================
     CHECKOUT
  ===================================================== */
const handleCheckout = async () => {

  if (!cart.length) {
    setToast({
      message: "Cart empty",
      type: "error"
    });
    return;
  }

  const payload = {
    storeId,

    /* 🔥 FIXED PAYLOAD */
    items: cart.map(i => ({
      itemId: i.id,
      quantity: i.qty
    })),

    total,
    paymentType,
    mode: multiScanMode ? "multi-lane" : "single"
  };

  try {

    if (!navigator.onLine) {

      window.electron?.ipcRenderer.send(
        "offline:add-sale",
        payload
      );

      setToast({
        message: "Saved offline",
        type: "warning"
      });

    } else {

      await api("/api/sales", "POST", payload);

    }

    setCart([]);
    setCustomerCash("");
    fetchItems();

    setToast({
      message: "Sale completed",
      type: "success"
    });

  } catch (err) {

    console.error("Checkout error:", err);

    setToast({
      message: err?.message || "Checkout failed",
      type: "error"
    });

  }

};

  /* =====================================================
     PRINT RECEIPT
  ===================================================== */

  const handlePrint = useReactToPrint({
    content: () => receiptRef.current,
    documentTitle: "SmartStock Receipt"
  });

  /* =====================================================
     FILTER ITEMS
  ===================================================== */

  const filteredItems = useMemo(() => {

    return items.filter((i) =>
      i.name
        .toLowerCase()
        .includes(search.toLowerCase())
    );

  }, [items, search]);

  /* =====================================================
     UI
  ===================================================== */

  return (

    <div className="p-4 space-y-6">

      <h1 className="text-2xl font-bold flex gap-2 items-center">
        <ShoppingCart className="text-blue-600"/>
        SmartStock POS
      </h1>

      {/* SEARCH */}

      <div className="flex gap-2 items-center">

        <Search size={18}/>

        <input
          value={search}
          onChange={(e)=>setSearch(e.target.value)}
          placeholder="Search or scan..."
          className="w-full p-2 border rounded-md"
        />

        <ScanLine
          className="cursor-pointer text-blue-600"
          onClick={()=>setShowScanner(!showScanner)}
        />

        <Layers
          className={`cursor-pointer ${
            multiScanMode
              ? "text-green-600"
              : ""
          }`}
          onClick={()=>setMultiScanMode(!multiScanMode)}
        />

      </div>

      {showScanner && (
        <CameraScanner
          continuous
          enterpriseMode
          onDetected={handleScan}
        />
      )}

      <div className="grid md:grid-cols-3 gap-6">

        {/* PRODUCTS */}

        <div className="md:col-span-2 grid grid-cols-3 gap-3">

          {filteredItems.map((i)=>(
            <div
              key={i.id}
              onClick={()=>addToCart(i)}
              className="border p-3 rounded-lg cursor-pointer hover:bg-blue-50 transition"
            >
              <h3 className="font-medium">
                {i.name}
              </h3>

              <p className="text-blue-600 font-semibold">
                Ksh {i.retailPrice}
              </p>

            </div>
          ))}

        </div>

        {/* CART */}

        <div className="border p-4 rounded-xl space-y-3">

          <h2 className="font-semibold">
            Cart ({cart.length})
          </h2>

          {cart.map((i)=>(
            <div
              key={i.cartId}
              className="flex justify-between items-center"
            >

              <div>

                {i.name}

                <div className="flex gap-2 mt-1">

                  <button onClick={()=>updateQty(i.cartId,-1)}>
                    <Minus size={16}/>
                  </button>

                  <span>{i.qty}</span>

                  <button onClick={()=>updateQty(i.cartId,1)}>
                    <Plus size={16}/>
                  </button>

                </div>

              </div>

              <div className="flex gap-2 items-center">

                <span>
                  Ksh {(i.qty*i.retailPrice).toFixed(2)}
                </span>

                <Trash2
                  size={16}
                  className="cursor-pointer text-red-500"
                  onClick={()=>removeItem(i.cartId)}
                />

              </div>

            </div>
          ))}

          <div className="border-t pt-3">

            
            <hr/>

<div className="flex justify-between">
  <span>Subtotal</span>
  <span>{base.toFixed(2)}</span>
</div>

<div className="flex justify-between">
  <span>VAT (16%)</span>
  <span>{tax.toFixed(2)}</span>
</div>

<div className="flex justify-between font-bold">
  <span>Total</span>
  <span>{total.toFixed(2)}</span>
</div>

            {scanScore!==null && (
              <div className="text-xs text-gray-500">
                Scan confidence {(scanScore*100).toFixed(0)}%
              </div>
            )}

          </div>

          <button
            onClick={handleCheckout}
            className="w-full mt-3 bg-blue-600 text-white py-2 rounded-lg"
          >
            Complete Sale
          </button>

          <button
            onClick={handlePrint}
            className="w-full bg-gray-700 text-white py-2 rounded-lg flex justify-center gap-2"
          >
            <Printer size={18}/>
            Print
          </button>

        </div>

      </div>

      {/* RECEIPT */}

      <div className="hidden">

        <div
          ref={receiptRef}
          className="p-4 w-72 text-sm font-mono"
        >

          <div className="text-center">

            <h2 className="font-bold">
              SmartStock POS
            </h2>

            <p>{new Date().toLocaleString()}</p>

          </div>

          <hr/>

          {cart.map((i)=>(
            <div
              key={i.cartId}
              className="flex justify-between"
            >
              <span>{i.name} x{i.qty}</span>
              <span>
                {(i.qty*i.retailPrice).toFixed(2)}
              </span>
            </div>
          ))}

          <hr/>

          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span>{total.toFixed(2)}</span>
          </div>

          <hr/>

          <div className="text-center text-xs">
            Thank you for shopping
          </div>

        </div>

      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <Toast
            {...toast}
            onClose={()=>setToast(null)}
          />
        </div>
      )}

    </div>

  );

};

export default POS;