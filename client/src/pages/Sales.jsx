import React, { useEffect, useState } from "react";
import {
  ShoppingCart,
  PlusCircle,
  Trash2,
  DollarSign,
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

  // ================= FETCH DATA =================
  const fetchData = async () => {
    try {
      const [itemsRes, salesRes, summaryRes] = await Promise.all([
        api("/api/items", "GET"),
        api("/api/sales", "GET"),
        api("/api/sales/summary/daily", "GET"),
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

    const item = items.find((i) => i._id === selectedItem);
    if (!item) return;

    if (quantity > item.stock) {
      return setToast({
        message: `Not enough stock for ${item.name}`,
        type: "warning",
      });
    }

    setCart((prev) => {
      const existing = prev.find((p) => p.item === item._id);
      if (existing) {
        return prev.map((p) =>
          p.item === item._id
            ? {
                ...p,
                quantity: p.quantity + quantity,
                total: p.unitPrice * (p.quantity + quantity),
                profit:
                  (item.retailPrice - item.wholesalePrice) *
                  (p.quantity + quantity),
              }
            : p
        );
      }

      return [
        ...prev,
        {
          item: item._id,
          name: item.name,
          quantity,
          unitPrice: item.retailPrice,
          total: item.retailPrice * quantity,
          profit:
            (item.retailPrice - item.wholesalePrice) * quantity,
        },
      ];
    });

    setSelectedItem("");
    setQuantity(1);
  };

  // ================= TOTALS =================
  const subtotal = cart.reduce((s, i) => s + i.total, 0);
  const discountAmount = (subtotal * discount) / 100;
  const taxAmount = ((subtotal - discountAmount) * tax) / 100;
  const grandTotal = subtotal - discountAmount + taxAmount;

  // ================= CHECKOUT =================
  const handleCheckout = async () => {
    if (!customer.trim())
      return setToast({ message: "Enter customer name", type: "warning" });

    if (cart.length === 0)
      return setToast({ message: "Cart is empty", type: "warning" });

    try {
      await api("/api/sales", "POST", {
        customerName: customer,
        items: cart,
        discount,
        tax,
        totalAmount: grandTotal,
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
        <Card title="Total Sales" value={`$${summary.totalSales || 0}`} icon={DollarSign} />
        <Card title="Profit" value={`$${summary.totalProfit || 0}`} />
        <Card title="Items Sold" value={summary.itemsSold || 0} />
        <Card title="Transactions" value={summary.transactions || 0} />
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
                <tr key={s._id} className="border-t">
                  <td className="p-3">{s.customerName}</td>
                  <td className="p-3">{s.items.length}</td>
                  <td className="p-3">${s.totalAmount.toFixed(2)}</td>
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
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="New Sale">
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
              <option key={i._id} value={i._id}>
                {i.name} — ${i.retailPrice} ({i.stock})
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

          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Discount %"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
              className="w-full p-2 border rounded"
            />
            <input
              type="number"
              placeholder="Tax %"
              value={tax}
              onChange={(e) => setTax(Number(e.target.value))}
              className="w-full p-2 border rounded"
            />
          </div>

          <button onClick={addToCart} className="w-full bg-green-600 text-white py-2 rounded">
            Add to Cart
          </button>

          {cart.length > 0 && (
            <>
              {cart.map((c, i) => (
                <div key={i} className="flex justify-between">
                  <span>{c.name} × {c.quantity}</span>
                  <button onClick={() => setCart(cart.filter((_, idx) => idx !== i))}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}

              <div className="border-t pt-2 text-sm">
                <p>Subtotal: ${subtotal.toFixed(2)}</p>
                <p>Discount: -${discountAmount.toFixed(2)}</p>
                <p>Tax: ${taxAmount.toFixed(2)}</p>
                <p className="font-semibold">Total: ${grandTotal.toFixed(2)}</p>
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
          <Toast {...toast} onClose={() => setToast(null)} />
        </div>
      )}
    </div>
  );
};

export default Sales;
