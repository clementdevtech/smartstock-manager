import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  DollarSign,
  CreditCard,
  Printer,
  Search,
} from "lucide-react";
import Toast from "../components/Toast";
import { useReactToPrint } from "react-to-print";

const POS = () => {
  const [items, setItems] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [paymentType, setPaymentType] = useState("cash");
  const [customerCash, setCustomerCash] = useState("");
  const receiptRef = useRef();
  const token = localStorage.getItem("token");
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  // ✅ Fetch available inventory
  const fetchItems = async () => {
    try {
      const res = await axios.get("/api/items", { headers });
      setItems(res.data || []);
    } catch (error) {
      console.error(error);
      setToast({ message: "Failed to load inventory", type: "error" });
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  // ✅ Add to cart
  const addToCart = (item) => {
    const existing = cart.find((c) => c._id === item._id);
    if (existing) {
      setCart(
        cart.map((c) =>
          c._id === item._id ? { ...c, qty: c.qty + 1 } : c
        )
      );
    } else {
      setCart([...cart, { ...item, qty: 1 }]);
    }
  };

  // ✅ Remove from cart
  const removeFromCart = (id) => {
    setCart(cart.filter((c) => c._id !== id));
  };

  // ✅ Change qty
  const updateQty = (id, delta) => {
    setCart(
      cart.map((c) =>
        c._id === id
          ? { ...c, qty: Math.max(1, c.qty + delta) }
          : c
      )
    );
  };

  // ✅ Totals
  const subTotal = cart.reduce(
    (sum, i) => sum + i.qty * i.retailPrice,
    0
  );
  const tax = subTotal * 0.16;
  const total = subTotal + tax;
  const change = customerCash ? customerCash - total : 0;

  // ✅ Complete sale
  const handleCheckout = async () => {
    if (cart.length === 0) {
      setToast({ message: "Cart is empty", type: "error" });
      return;
    }
    try {
      const saleData = {
        items: cart.map((i) => ({
          id: i._id,
          name: i.name,
          qty: i.qty,
          price: i.retailPrice,
        })),
        total,
        paymentType,
      };

      await axios.post("/api/sales", saleData, { headers });

      // ✅ Reduce stock
      for (const item of cart) {
        await axios.put(`/api/items/${item._id}`, {
          ...item,
          quantity: item.quantity - item.qty,
        }, { headers });
      }

      setToast({ message: "Sale completed successfully!", type: "success" });
      setCart([]);
      setCustomerCash("");
      fetchItems();
    } catch (error) {
      console.error(error);
      setToast({ message: "Checkout failed", type: "error" });
    }
  };

  // ✅ Print Receipt
  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: "Receipt",
  });

  // ✅ Search filter
  const filteredItems = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6 text-gray-800 dark:text-gray-100">
        <ShoppingCart className="text-blue-600" /> Point of Sale
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Product List */}
        <div className="md:col-span-2 bg-white dark:bg-gray-900 p-4 rounded-xl shadow border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <Search size={18} className="text-gray-500" />
            <input
              type="text"
              placeholder="Search product..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full p-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredItems.map((i) => (
              <div
                key={i._id}
                onClick={() => addToCart(i)}
                className="cursor-pointer border p-3 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
              >
                <h3 className="font-medium text-gray-800 dark:text-gray-100">{i.name}</h3>
                <p className="text-sm text-gray-500 capitalize">{i.category}</p>
                <p className="text-blue-600 font-semibold mt-1">${i.retailPrice}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Cart */}
        <div className="bg-white dark:bg-gray-900 p-4 rounded-xl shadow border border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2 mb-3">
            <ShoppingCart size={18} /> Cart ({cart.length})
          </h2>

          <div className="max-h-64 overflow-y-auto">
            {cart.length > 0 ? (
              cart.map((i) => (
                <div
                  key={i._id}
                  className="flex justify-between items-center border-b py-2"
                >
                  <div>
                    <h3 className="font-medium">{i.name}</h3>
                    <p className="text-sm text-gray-500">
                      ${i.retailPrice} × {i.qty}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateQty(i._id, -1)}>
                      <Minus size={16} />
                    </button>
                    <span>{i.qty}</span>
                    <button onClick={() => updateQty(i._id, 1)}>
                      <Plus size={16} />
                    </button>
                    <button
                      onClick={() => removeFromCart(i._id)}
                      className="text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center mt-4">No items added.</p>
            )}
          </div>

          {/* Totals */}
          <div className="border-t pt-3 mt-3 text-sm text-gray-700 dark:text-gray-300">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>${subTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax (16%):</span>
              <span>${tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold text-lg mt-1">
              <span>Total:</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment */}
          <div className="mt-4">
            <label className="block mb-2 text-gray-600 dark:text-gray-300">
              Payment Method:
            </label>
            <select
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
              className="w-full p-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="mobile">Mobile Payment</option>
            </select>

            {paymentType === "cash" && (
              <>
                <input
                  type="number"
                  placeholder="Customer cash"
                  value={customerCash}
                  onChange={(e) => setCustomerCash(e.target.value)}
                  className="w-full mt-2 p-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
                />
                {customerCash && (
                  <p
                    className={`mt-1 text-sm ${
                      change >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    Change: ${change.toFixed(2)}
                  </p>
                )}
              </>
            )}
          </div>

          <button
            onClick={handleCheckout}
            className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg flex items-center justify-center gap-2"
          >
            <DollarSign size={18} /> Complete Sale
          </button>

          <button
            onClick={handlePrint}
            className="w-full mt-2 bg-gray-700 hover:bg-gray-800 text-white py-2 rounded-lg flex items-center justify-center gap-2"
          >
            <Printer size={18} /> Print Receipt
          </button>
        </div>
      </div>

      {/* Receipt (Hidden for print) */}
      <div className="hidden">
        <div ref={receiptRef} className="p-6 text-sm">
          <h2 className="font-bold text-lg mb-2">🏀CocoPOS Receipt</h2>
          <hr className="my-2" />
          {cart.map((i) => (
            <div key={i._id} className="flex justify-between">
              <span>
                {i.name} × {i.qty}
              </span>
              <span>${(i.qty * i.retailPrice).toFixed(2)}</span>
            </div>
          ))}
          <hr className="my-2" />
          <p>Subtotal: ${subTotal.toFixed(2)}</p>
          <p>Tax: ${tax.toFixed(2)}</p>
          <p className="font-bold">Total: ${total.toFixed(2)}</p>
          <p className="mt-2">Payment: {paymentType}</p>
          <p className="mt-1 text-xs text-gray-500">
            Thank you for your purchase!
          </p>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <Toast {...toast} onClose={() => setToast(null)} />
        </div>
      )}
    </div>
  );
};

export default POS;
