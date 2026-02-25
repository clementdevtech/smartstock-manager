import React, { useEffect, useMemo, useState } from "react";
import {
  ShoppingCart,
  PlusCircle,
  Trash2,
  Search,
  AlertCircle,
} from "lucide-react";
import Toast from "../components/Toast";
import Card from "../components/Card";
import Modal from "../components/Modal";
import { api } from "../utils/api";

const Sales = () => {
  const [items, setItems] = useState([]);
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState({});
  const [selectedItem, setSelectedItem] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(16);
  const [customer, setCustomer] = useState("");
  const [cart, setCart] = useState([]);
  const [toast, setToast] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const storeId = localStorage.getItem("storeId");

  // ================= FETCH DATA =================
  const fetchData = async () => {
    try {
      const [itemsRes, salesRes, summaryRes] = await Promise.all([
        api(`/api/items?storeId=${storeId}`, "GET"),
        api(`/api/sales?storeId=${storeId}`, "GET"),
        api(`/api/sales/summary/daily?storeId=${storeId}`, "GET"),
      ]);

      setItems(itemsRes || []);
      setSales(salesRes || []);
      setSummary(summaryRes || {});
    } catch {
      setToast({ message: "Failed to load sales data", type: "error" });
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ================= ADD TO CART =================
  const addToCart = () => {
    if (!selectedItem || quantity <= 0) return;

    const item = items.find((i) => i.id === selectedItem);
    if (!item) return;

    setCart((prev) => {
      const existing = prev.find((p) => p.id === item.id);

      const newQuantity = existing
        ? existing.quantity + quantity
        : quantity;

      if (newQuantity > item.stock) {
        setToast({
          message: `Not enough stock for ${item.name}`,
          type: "warning",
        });
        return prev;
      }

      if (existing) {
        return prev.map((p) =>
          p.id === item.id
            ? { ...p, quantity: newQuantity }
            : p
        );
      }

      return [
        ...prev,
        {
          id: item.id,
          name: item.name,
          unitPrice: item.retailPrice,
          costPrice: item.wholesalePrice,
          quantity,
        },
      ];
    });

    setSelectedItem("");
    setQuantity(1);
  };

  // ================= REMOVE ITEM =================
  const removeFromCart = (id) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  // ================= UPDATE QUANTITY =================
  const updateQuantity = (id, value) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const newQty = Number(value);
    if (newQty <= 0) return;

    if (newQty > item.stock) {
      setToast({
        message: `Only ${item.stock} in stock`,
        type: "warning",
      });
      return;
    }

    setCart((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, quantity: newQty } : c
      )
    );
  };

  // ================= DERIVED TOTALS =================
  const subtotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0
      ),
    [cart]
  );

  const totalProfit = useMemo(
    () =>
      cart.reduce(
        (sum, item) =>
          sum +
          (item.unitPrice - item.costPrice) *
            item.quantity,
        0
      ),
    [cart]
  );

  const discountAmount = (subtotal * discount) / 100;
  const taxAmount = ((subtotal - discountAmount) * tax) / 100;
  const grandTotal = subtotal - discountAmount + taxAmount;

  // ================= CHECKOUT =================
  const handleCheckout = async () => {
    if (!customer.trim())
      return setToast({
        message: "Enter customer name",
        type: "warning",
      });

    if (cart.length === 0)
      return setToast({
        message: "Cart is empty",
        type: "warning",
      });

    try {
      await api("/api/sales", "POST", {
        storeId,
        customerName: customer,
        items: cart,
        discount,
        tax,
        totalAmount: grandTotal,
        profit: totalProfit,
      });

      setToast({ message: "Sale completed", type: "success" });

      setCart([]);
      setCustomer("");
      setDiscount(0);
      setTax(16);
      setShowModal(false);
      fetchData();
    } catch {
      setToast({ message: "Sale failed", type: "error" });
    }
  };

  const filteredItems = items.filter((i) =>
    i.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      {/* HEADER */}
      <div className="flex justify-between mb-6">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <ShoppingCart /> Sales
        </h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded flex gap-2"
        >
          <PlusCircle size={18} /> New Sale
        </button>
      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card title="Total Sales" value={`ksh${summary.totalSales || 0}`} />
        <Card title="Profit" value={`ksh${summary.totalProfit || 0}`} />
        <Card title="Items Sold" value={`${summary.itemsSold || 0}`} />
        <Card title="Transactions" value={`${summary.transactions || 0}`} />
      </div>

      {/* SALES TABLE */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="p-3">Customer</th>
              <th className="p-3">Items</th>
              <th className="p-3">Total</th>
              <th className="p-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 ? (
              <tr>
                <td colSpan="4" className="text-center py-6 text-gray-500">
                  <AlertCircle className="inline mr-2" />
                  No sales yet
                </td>
              </tr>
            ) : (
              sales.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="p-3">{s.customerName}</td>
                  <td className="p-3">{s.items.length}</td>
                  <td className="p-3">
                    ksh{s.totalAmount.toFixed(2)}
                  </td>
                  <td className="p-3">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* NEW SALE MODAL */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="New Sale"
      >
        <div className="space-y-4">
          <input
            placeholder="Customer name"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            className="w-full p-2 border rounded"
          />

          <div className="flex items-center gap-2">
            <Search size={16} />
            <input
              placeholder="Search item"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-2 border rounded"
            />
          </div>

          <select
            value={selectedItem}
            onChange={(e) => setSelectedItem(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="">Select item</option>
            {filteredItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} — ksh{i.retailPrice} ({i.stock})
              </option>
            ))}
          </select>

          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="w-full p-2 border rounded"
          />

          <button
            onClick={addToCart}
            className="w-full bg-green-600 text-white py-2 rounded"
          >
            Add to Cart
          </button>

          {cart.length > 0 && (
            <>
              {cart.map((c) => (
                <div
                  key={c.id}
                  className="flex justify-between items-center"
                >
                  <div>
                    <p className="font-medium">
                      {c.name}
                    </p>
                    <input
                      type="number"
                      min="1"
                      value={c.quantity}
                      onChange={(e) =>
                        updateQuantity(c.id, e.target.value)
                      }
                      className="w-20 p-1 border rounded mt-1"
                    />
                  </div>

                  <button
                    onClick={() => removeFromCart(c.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}

              <div className="border-t pt-2 text-sm">
                <p>Subtotal: ksh{subtotal.toFixed(2)}</p>
                <p>Discount: -ksh{discountAmount.toFixed(2)}</p>
                <p>Tax: ksh{taxAmount.toFixed(2)}</p>
                <p className="font-semibold">
                  Total: ksh{grandTotal.toFixed(2)}
                </p>
              </div>

              <button
                onClick={handleCheckout}
                className="w-full bg-blue-600 text-white py-2 rounded"
              >
                Confirm Sale
              </button>
            </>
          )}
        </div>
      </Modal>

      {toast && (
        <div className="fixed bottom-4 right-4">
          <Toast
            {...toast}
            onClose={() => setToast(null)}
          />
        </div>
      )}
    </div>
  );
};

export default Sales;