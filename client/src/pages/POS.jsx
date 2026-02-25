import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  DollarSign,
  Printer,
  Search,
  ScanLine,
} from "lucide-react";
import Toast from "../components/Toast";
import { useReactToPrint } from "react-to-print";
import { api } from "../utils/api";
import CameraScanner from "../components/CameraScanner";

/* =====================================================
   BARCODE SCANNER (USB keyboard wedge)
===================================================== */
const useBarcodeScanner = (onScan) => {
  const buffer = useRef("");
  const lastTime = useRef(Date.now());

  useEffect(() => {
    const handler = (e) => {
      const now = Date.now();
      if (now - lastTime.current > 120) buffer.current = "";
      lastTime.current = now;

      if (e.key === "Enter") {
        if (buffer.current.length >= 6) {
          onScan(buffer.current.trim());
        }
        buffer.current = "";
        return;
      }

      if (/^[0-9A-Za-z]$/.test(e.key)) {
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
  const [stockFlash, setStockFlash] = useState(null);

  const [paymentType, setPaymentType] = useState("cash");
  const [customerCash, setCustomerCash] = useState("");

  const receiptRef = useRef();

  const storeId = localStorage.getItem("storeId"); 

  /* ===============================
     SOUND ON SUCCESS
  =============================== */
  const SALE_SOUND =
    "https://actions.google.com/sounds/v1/cartoon/clang_and_wobble.ogg";

  const playSaleSound = () => {
    const audio = new Audio(SALE_SOUND);
    audio.play().catch(() => {});
  };

  /* =====================================================
     FETCH INVENTORY
  ===================================================== */
  const fetchItems = async () => {
  try {
    const res = await api(`/api/items?storeId=${storeId}`, "GET");
    setItems(Array.isArray(res) ? res : []);
  } catch (err) {
    console.error(err);
    setToast({ message: "Failed to load inventory", type: "error" });
  }
};

  useEffect(() => {
    fetchItems();
  }, []);

  /* =====================================================
     BARCODE SCAN → ADD TO CART
  ===================================================== */
  const handleBarcodeScan = useCallback(
    async (code) => {
      const clean = code.trim();

      let item = items.find(
        (i) =>
          i.sku?.trim() === clean ||
          i.barcode?.trim() === clean
      );

      // 🌍 Fallback online lookup
      if (!item) {
        try {
          const res = await fetch(
            `https://world.openfoodfacts.org/api/v0/product/${clean}.json`
          );
          const data = await res.json();

          if (data.status === 1) {
            setToast({
              message: `Found online: ${data.product.product_name}`,
              type: "warning",
            });
          } else {
            setToast({
              message: `Unknown barcode: ${clean}`,
              type: "error",
            });
          }
        } catch {
          setToast({
            message: `Unknown barcode: ${clean}`,
            type: "error",
          });
        }
        return;
      }

      addToCart(item);

      setStockFlash(item._id);
      setTimeout(() => setStockFlash(null), 400);

      setToast({
        message: `${item.name} added`,
        type: "success",
      });
    },
    [items]
  );

  useBarcodeScanner(handleBarcodeScan);

  const handleCameraDetected = (code) => {
    handleBarcodeScan(code);
  };

  /* =====================================================
     CART LOGIC
  ===================================================== */
  const addToCart = (item) => {
    if (item.stock <= 0) {
      setToast({ message: "Out of stock", type: "error" });
      return;
    }

    setCart((prev) => {
      const found = prev.find((c) => c._id === item._id);

      if (found) {
        if (found.qty + 1 > item.stock) {
          setToast({
            message: "Not enough stock",
            type: "error",
          });
          return prev;
        }

        return prev.map((c) =>
          c._id === item._id
            ? { ...c, qty: c.qty + 1 }
            : c
        );
      }

      return [
          ...prev,
            {
              ...item,
              cartId: crypto.randomUUID(),
              qty: 1,
              },
          ];
        });
        };

  const removeFromCart = (id) =>
    setCart(cart.filter((c) => c._id !== id));

  const updateQty = (id, delta) =>
    setCart((prev) =>
      prev.map((c) => {
        if (c._id !== id) return c;
        const newQty = Math.max(1, c.qty + delta);
        if (newQty > c.stock) {
          setToast({
            message: "Not enough stock",
            type: "error",
          });
          return c;
        }
        return { ...c, qty: newQty };
      })
    );

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
     CHECKOUT
  ===================================================== */
  const handleCheckout = async () => {
    if (!cart.length) {
      setToast({
        message: "Cart is empty",
        type: "error",
      });
      return;
    }

    if (paymentType === "cash" && change < 0) {
      setToast({
        message: "Insufficient cash",
        type: "error",
      });
      return;
    }

    const payload = {
      items: cart.map((i) => ({
        item: i._id,
        name: i.name,
        quantity: i.qty,
        unitPrice: i.retailPrice,
        total: i.qty * i.retailPrice,
        profit:
          i.qty *
          (i.retailPrice - i.wholesalePrice),
      })),
      paymentStatus:
        paymentType === "cash"
          ? "paid"
          : "pending",
    };

    try {
      if (!navigator.onLine) {
        window.electron?.ipcRenderer.send(
          "offline:add-sale",
          payload
        );
        setToast({
          message: "Sale saved offline",
          type: "warning",
        });
      } else {
        await api("/api/sales", "POST", payload);
      }

      playSaleSound();

      setCart([]);
      setCustomerCash("");
      fetchItems();
    } catch {
      setToast({
        message: "Checkout failed",
        type: "error",
      });
    }
  };

  /* =====================================================
     PRINT RECEIPT
  ===================================================== */
  const handlePrint = useReactToPrint({
    content: () => receiptRef.current,
    documentTitle: "SmartStock Receipt",
  });

  /* =====================================================
     SEARCH
  ===================================================== */
  const filteredItems = items.filter(
    (i) =>
      i.name
        .toLowerCase()
        .includes(search.toLowerCase()) ||
      (i.sku || "")
        .toLowerCase()
        .includes(search.toLowerCase())
  );

  /* =====================================================
     UI
  ===================================================== */
  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <ShoppingCart className="text-blue-600" />
        Point of Sale
      </h1>

      <div className="grid md:grid-cols-3 gap-6">
        {/* PRODUCTS */}
        <div className="md:col-span-2 bg-white dark:bg-gray-900 p-4 rounded-xl border">
          <div className="flex gap-2 mb-4">
            <Search size={18} />
            <input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Search name or scan barcode..."
              className="w-full p-2 border rounded-md dark:bg-gray-800"
            />
            <ScanLine
              className="text-blue-600 cursor-pointer"
              onClick={() => setShowScanner(true)}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredItems.map((i, index) => (
              <div key={i._id || `${i.sku}-${index}`}
              
                onClick={() => addToCart(i)}
                className={`cursor-pointer border p-3 rounded-lg transition-all duration-300 ${
                  stockFlash === i._id
                    ? "bg-green-100 scale-105"
                    : "hover:bg-blue-50 dark:hover:bg-blue-900/20"
                }`}
              >
                <h3 className="font-medium">
                  {i.name}
                </h3>
                <p className="text-xs text-gray-500">
                  SKU: {i.sku || "-"}
                </p>
                <p className="text-blue-600 font-semibold mt-1">
                  ksh{i.retailPrice}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* CART (UNCHANGED STRUCTURE) */}
        <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border">
          <h2 className="font-semibold mb-3">
            Cart ({cart.length})
          </h2>

          <div className="max-h-64 overflow-y-auto">
            {cart.map((i) => (
              <div key={i.cartId}
                className="flex justify-between py-2 border-b"
              >
                <div>
                  <div className="font-medium">
                    {i.name}
                  </div>
                  <div className="text-xs">
                    ksh{i.retailPrice} × {i.qty}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Minus
                    size={14}
                    onClick={() =>
                      updateQty(i._id, -1)
                    }
                  />
                  {i.qty}
                  <Plus
                    size={14}
                    onClick={() =>
                      updateQty(i._id, 1)
                    }
                  />
                  <Trash2
                    size={14}
                    className="text-red-500"
                    onClick={() =>
                      removeFromCart(i._id)
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="border-t pt-3 mt-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>ksh{subTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax</span>
              <span>ksh{tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Total</span>
              <span>ksh{total.toFixed(2)}</span>
            </div>
            {paymentType === "cash" && (
              <div className="flex justify-between text-green-600">
                <span>Change</span>
                <span>
                  ksh{change.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          <select
            value={paymentType}
            onChange={(e) =>
              setPaymentType(e.target.value)
            }
            className="w-full mt-3 p-2 border rounded-md"
          >
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="mobile">Mobile</option>
          </select>

          {paymentType === "cash" && (
            <input
              type="number"
              value={customerCash}
              onChange={(e) =>
                setCustomerCash(e.target.value)
              }
              placeholder="Customer cash"
              className="w-full mt-2 p-2 border rounded-md"
            />
          )}

          <button
            onClick={handleCheckout}
            className="w-full mt-4 bg-blue-600 text-white py-2 rounded-lg flex justify-center gap-2"
          >
            ksh 
            Complete Sale
          </button>

          <button
            onClick={handlePrint}
            className="w-full mt-2 bg-gray-700 text-white py-2 rounded-lg flex justify-center gap-2"
          >
            <Printer size={18} />
            Print Receipt
          </button>
        </div>
      </div>

      {/* CAMERA SCANNER */}
      {showScanner && (
        <CameraScanner
          onDetected={handleCameraDetected}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* RECEIPT */}
      <div className="hidden">
        <div
          ref={receiptRef}
          className="p-4 text-sm w-72"
        >
          <h2 className="text-center font-bold">
            SmartStock
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
                ksh
                {(
                  i.qty * i.retailPrice
                ).toFixed(2)}
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
          <Toast
            {...toast}
            onClose={() => setToast(null)}
          />
        </div>
      )}
    </div>
  );
};

export default POS;
