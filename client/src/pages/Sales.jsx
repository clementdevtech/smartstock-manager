import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  ShoppingCart,
  PlusCircle,
  Trash2,
  DollarSign,
  Search,
  User,
  Tag,
  Percent,
  AlertCircle
} from 'lucide-react';
import Toast from '../components/Toast';
import Card from '../components/Card';
import Modal from '../components/Modal';

const Sales = () => {
  const [items, setItems] = useState([]);
  const [sales, setSales] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [customer, setCustomer] = useState('');
  const [cart, setCart] = useState([]);
  const [toast, setToast] = useState(null);
  const [summary, setSummary] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  // ✅ Fetch inventory + sales data
  const fetchData = async () => {
    try {
      const [itemsRes, salesRes, summaryRes] = await Promise.all([
        axios.get('/api/items', { headers }),
        axios.get('/api/sales', { headers }),
        axios.get('/api/sales/summary/daily', { headers }),
      ]);
      setItems(itemsRes.data);
      setSales(salesRes.data);
      setSummary(summaryRes.data);
    } catch (err) {
      console.error(err);
      setToast({ message: 'Failed to fetch sales data', type: 'error' });
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ✅ Add item to cart
  const addToCart = () => {
    if (!selectedItem || quantity <= 0) return;
    const item = items.find((i) => i._id === selectedItem);
    if (!item) return;

    if (quantity > item.stock) {
      return setToast({
        message: `Insufficient stock for ${item.name}`,
        type: 'warning',
      });
    }

    const total = item.retailPrice * quantity;
    const profit = (item.retailPrice - item.wholesalePrice) * quantity;

    setCart((prev) => [
      ...prev,
      {
        item: item._id,
        name: item.name,
        quantity,
        total,
        profit,
        unitPrice: item.retailPrice,
      },
    ]);

    setSelectedItem('');
    setQuantity(1);
    setSearchTerm('');
  };

  // ✅ Handle checkout
  const handleCheckout = async () => {
    if (!customer.trim()) return setToast({ message: 'Enter customer name', type: 'warning' });
    if (cart.length === 0) return setToast({ message: 'Cart is empty', type: 'warning' });

    try {
      const totalBeforeTax = cart.reduce((sum, i) => sum + i.total, 0);
      const totalDiscount = (totalBeforeTax * discount) / 100;
      const totalTax = ((totalBeforeTax - totalDiscount) * tax) / 100;
      const grandTotal = totalBeforeTax - totalDiscount + totalTax;

      await axios.post('/api/sales', {
        customerName: customer,
        items: cart,
        discount,
        tax,
        totalAmount: grandTotal,
      }, { headers });

      setToast({ message: '✅ Sale completed successfully!', type: 'success' });
      setCart([]);
      setCustomer('');
      setDiscount(0);
      setTax(0);
      fetchData();
      setShowModal(false);
    } catch (error) {
      console.error(error);
      setToast({ message: '❌ Sale failed', type: 'error' });
    }
  };

  // ✅ Cart totals
  const totalCartAmount = cart.reduce((sum, i) => sum + i.total, 0);
  const totalProfit = cart.reduce((sum, i) => sum + i.profit, 0);
  const totalDiscount = (totalCartAmount * discount) / 100;
  const totalTax = ((totalCartAmount - totalDiscount) * tax) / 100;
  const grandTotal = totalCartAmount - totalDiscount + totalTax;

  const filteredItems = items.filter((i) =>
    i.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <ShoppingCart /> Sales
        </h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow"
        >
          <PlusCircle size={18} /> New Sale
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card title="Total Sales" value={`$${summary.totalSales || 0}`} icon={DollarSign} trend={5} />
        <Card title="Profit" value={`$${summary.totalProfit || 0}`} trend={3} />
        <Card title="Items Sold" value={summary.itemsSold || 0} icon={ShoppingCart} trend={1} />
        <Card title="Transactions" value={summary.transactions || 0} />
      </div>

      {/* Sales History */}
      <div className="overflow-x-auto bg-white dark:bg-gray-900 shadow rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm text-left">
          <thead className="table-header text-gray-700 dark:text-gray-200">
            <tr>
              <th className="p-3">Customer</th>
              <th className="p-3">Items</th>
              <th className="p-3">Total ($)</th>
              <th className="p-3">Profit ($)</th>
              <th className="p-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center py-5 text-gray-500">
                  <AlertCircle className="inline mr-2" /> No sales data available
                </td>
              </tr>
            ) : (
              sales.map((s) => (
                <tr
                  key={s._id}
                  className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                >
                  <td className="p-3">{s.customerName}</td>
                  <td className="p-3">{s.items.length}</td>
                  <td className="p-3 font-medium text-gray-800">${s.totalAmount.toFixed(2)}</td>
                  <td className="p-3 text-green-600">${s.totalProfit.toFixed(2)}</td>
                  <td className="p-3 text-gray-500">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* New Sale Modal */}
      {/* Improved New Sale Modal */}
<Modal isOpen={showModal} onClose={() => setShowModal(false)} title="New Sale">
  <div className="space-y-5">
    {/* Customer Info */}
    <div>
      <label className="text-sm text-gray-600 dark:text-gray-300 block mb-1">Customer Name (optional)</label>
      <input
        type="text"
        className="w-full p-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
        placeholder="e.g. John Doe"
        value={summary.customerName || ''}
        onChange={(e) => setSummary({ ...summary, customerName: e.target.value })}
      />
    </div>

    {/* Select Item */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
      <div className="col-span-2">
        <label className="text-sm text-gray-600 dark:text-gray-300 block mb-1">Select Item</label>
        <select
          className="w-full p-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
          value={selectedItem}
          onChange={(e) => setSelectedItem(e.target.value)}
        >
          <option value="">Choose an item</option>
          {items.map((i) => (
            <option key={i._id} value={i._id} disabled={i.stock <= 0}>
              {i.name} — ${i.retailPrice} ({i.stock} in stock)
            </option>
          ))}
        </select>
      </div>

      {/* Quantity Input */}
      <div>
        <label className="text-sm text-gray-600 dark:text-gray-300 block mb-1">Quantity</label>
        <input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          className="w-full p-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
          min="1"
        />
      </div>
    </div>

    {/* Add to Cart */}
    <div className="flex justify-end">
      <button
        onClick={() => {
          const item = items.find((i) => i._id === selectedItem);
          if (!item) return setToast({ message: 'Select an item first!', type: 'warning' });
          if (quantity > item.stock) return setToast({ message: 'Not enough stock!', type: 'error' });

          setCart((prev) => {
            const existing = prev.find((p) => p.item === item._id);
            if (existing) {
              return prev.map((p) =>
                p.item === item._id
                  ? { ...p, quantity: p.quantity + quantity, total: p.unitPrice * (p.quantity + quantity) }
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
                profit: (item.retailPrice - item.wholesalePrice) * quantity,
              },
            ];
          });
          setSelectedItem('');
          setQuantity(1);
        }}
        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium"
      >
        <PlusCircle size={18} /> Add to Cart
      </button>
    </div>

    {/* Cart Section */}
    {cart.length > 0 && (
      <div className="border-t pt-3 space-y-2">
        <div className="max-h-56 overflow-y-auto pr-1">
          {cart.map((c, idx) => (
            <div key={idx} className="flex justify-between items-center py-1 text-sm">
              <div>
                <span className="font-medium text-gray-800 dark:text-gray-100">{c.name}</span> × {c.quantity}
                <span className="ml-2 text-xs text-gray-500">${c.unitPrice.toFixed(2)} ea</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-800">${c.total.toFixed(2)}</span>
                <button
                  onClick={() => setCart(cart.filter((_, i) => i !== idx))}
                  className="text-red-500 hover:text-red-600"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="border-t pt-3 mt-2 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>${cart.reduce((sum, i) => sum + i.total, 0).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Tax (16%):</span>
            <span>${(cart.reduce((sum, i) => sum + i.total, 0) * 0.16).toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold text-lg">
            <span>Total:</span>
            <span>${(cart.reduce((sum, i) => sum + i.total, 0) * 1.16).toFixed(2)}</span>
          </div>

          {/* Checkout */}
          <button
            onClick={() => {
              if (!window.confirm('Confirm this sale?')) return;
              handleCheckout();
            }}
            className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md font-medium"
          >
            Confirm Sale
          </button>
        </div>
      </div>
    )}
  </div>
</Modal>


      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <Toast {...toast} onClose={() => setToast(null)} />
        </div>
      )}
    </div>
  );
};

export default Sales;
