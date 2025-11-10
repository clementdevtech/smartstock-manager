import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  PlusCircle,
  Trash2,
  Edit3,
  Package,
  Search,
  BarChart3,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import Modal from "../components/Modal";
import Toast from "../components/Toast";

const Inventory = () => {
  const [items, setItems] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    category: "other",
    wholesalePrice: "",
    retailPrice: "",
    quantity: "",
    entryDate: "",
    expiryDate: "",
  });

  const token = localStorage.getItem("token");
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  // ✅ Fetch all items
const fetchItems = async () => {
  try {
    setLoading(true);
    const res = await axios.get("/api/items", { headers });
    const data = Array.isArray(res.data)
      ? res.data
      : Array.isArray(res.data.items)
      ? res.data.items
      : [];

    setItems(data);
    setFiltered(data);
    setLoading(false);
  } catch (err) {
    console.error(err);
    setToast({ message: "Failed to fetch items", type: "error" });
    setLoading(false);
  }
};


  // ✅ Add or Edit item
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await axios.put(`/api/items/${editingItem._id}`, formData, { headers });
        setToast({ message: "Item updated successfully!", type: "success" });
      } else {
        await axios.post("/api/items", formData, { headers });
        setToast({ message: "Item added successfully!", type: "success" });
      }
      setShowModal(false);
      setFormData({
        name: "",
        category: "other",
        wholesalePrice: "",
        retailPrice: "",
        quantity: "",
        entryDate: "",
        expiryDate: "",
      });
      setEditingItem(null);
      fetchItems();
    } catch (error) {
      console.error(error);
      setToast({ message: "Action failed", type: "error" });
    }
  };

  // ✅ Delete item
  const handleDelete = async (id) => {
    if (!window.confirm("Delete this item?")) return;
    try {
      await axios.delete(`/api/items/${id}`, { headers });
      fetchItems();
      setToast({ message: "Item deleted!", type: "warning" });
    } catch (error) {
      console.error(error);
      setToast({ message: "Error deleting item", type: "error" });
    }
  };

  // ✅ Search and Filter
  useEffect(() => {
    const filteredItems = items.filter((i) =>
      i.name.toLowerCase().includes(search.toLowerCase())
    );
    setFiltered(filteredItems);
  }, [search, items]);

  useEffect(() => {
    fetchItems();
  }, []);

  // ✅ Quick Stats
  const totalStock = items.reduce((sum, i) => sum + Number(i.quantity), 0);
  const totalValue = items.reduce(
    (sum, i) => sum + i.quantity * i.retailPrice,
    0
  );
  const totalProfit = items.reduce(
    (sum, i) =>
      sum + i.quantity * (i.retailPrice - i.wholesalePrice),
    0
  );

  // ✅ Helper
  const lowStock = (q) => q < 5;

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-800 dark:text-gray-100">
          <Package className="text-blue-600" /> Inventory Management
        </h1>
        <button
          onClick={() => {
            setShowModal(true);
            setEditingItem(null);
          }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow"
        >
          <PlusCircle size={18} /> Add Item
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-100 dark:bg-blue-900/30 p-4 rounded-xl flex items-center justify-between">
          <span className="font-medium">Total Stock</span>
          <span className="font-bold text-blue-600">{totalStock}</span>
        </div>
        <div className="bg-green-100 dark:bg-green-900/30 p-4 rounded-xl flex items-center justify-between">
          <span className="font-medium">Total Value</span>
          <span className="font-bold text-green-600">${totalValue.toFixed(2)}</span>
        </div>
        <div className="bg-yellow-100 dark:bg-yellow-900/30 p-4 rounded-xl flex items-center justify-between">
          <span className="font-medium">Total Profit</span>
          <span className="font-bold text-yellow-600">${totalProfit.toFixed(2)}</span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-2 mb-4">
        <Search size={18} className="text-gray-500" />
        <input
          type="text"
          placeholder="Search items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full p-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto bg-white dark:bg-gray-900 shadow rounded-xl border border-gray-200 dark:border-gray-700">
        {loading ? (
          <div className="p-6 flex justify-center">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        ) : filtered.length > 0 ? (
          <table className="w-full text-sm text-left">
            <thead className="text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Category</th>
                <th className="p-3">Quantity</th>
                <th className="p-3">Wholesale</th>
                <th className="p-3">Retail</th>
                <th className="p-3">Profit</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const profit =
                  Number(i.retailPrice || 0) - Number(i.wholesalePrice || 0);
                return (
                  <tr
                    key={i._id}
                    className={`border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition ${
                      lowStock(i.quantity) ? "bg-red-50 dark:bg-red-900/20" : ""
                    }`}
                  >
                    <td className="p-3 font-medium">{i.name}</td>
                    <td className="p-3 capitalize">{i.category}</td>
                    <td className="p-3 flex items-center gap-1">
                      {i.quantity}
                      {lowStock(i.quantity) && (
                        <AlertTriangle
                          size={16}
                          className="text-red-500"
                          title="Low stock"
                        />
                      )}
                    </td>
                    <td className="p-3">${i.wholesalePrice}</td>
                    <td className="p-3">${i.retailPrice}</td>
                    <td className="p-3 text-green-600 font-medium">
                      ${profit.toFixed(2)}
                    </td>
                    <td className="p-3 text-right flex gap-2 justify-end">
                      <button
                        onClick={() => {
                          setEditingItem(i);
                          setFormData(i);
                          setShowModal(true);
                        }}
                        className="p-2 text-blue-600 hover:text-blue-700"
                      >
                        <Edit3 size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(i._id)}
                        className="p-2 text-red-500 hover:text-red-700"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="text-center p-6 text-gray-500 dark:text-gray-400">
            No items found.
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingItem ? "Edit Item" : "Add New Item"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Item Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full p-2 border rounded-md dark:bg-gray-800 dark:border-gray-600"
            required
          />
          <select
            value={formData.category}
            onChange={(e) =>
              setFormData({ ...formData, category: e.target.value })
            }
            className="w-full p-2 border rounded-md dark:bg-gray-800 dark:border-gray-600"
          >
            <option value="electronics">Electronics</option>
            <option value="groceries">Groceries</option>
            <option value="clothing">Clothing</option>
            <option value="home">Home</option>
            <option value="other">Other</option>
          </select>
          <div className="flex gap-3">
            <input
              type="number"
              placeholder="Wholesale Price"
              value={formData.wholesalePrice}
              onChange={(e) =>
                setFormData({ ...formData, wholesalePrice: e.target.value })
              }
              className="w-1/2 p-2 border rounded-md dark:bg-gray-800 dark:border-gray-600"
              required
            />
            <input
              type="number"
              placeholder="Retail Price"
              value={formData.retailPrice}
              onChange={(e) =>
                setFormData({ ...formData, retailPrice: e.target.value })
              }
              className="w-1/2 p-2 border rounded-md dark:bg-gray-800 dark:border-gray-600"
              required
            />
          </div>
          <div className="flex gap-3">
            <input
              type="number"
              placeholder="Quantity"
              value={formData.quantity}
              onChange={(e) =>
                setFormData({ ...formData, quantity: e.target.value })
              }
              className="w-1/2 p-2 border rounded-md dark:bg-gray-800 dark:border-gray-600"
              required
            />
            <input
              type="date"
              value={formData.entryDate}
              onChange={(e) =>
                setFormData({ ...formData, entryDate: e.target.value })
              }
              className="w-1/2 p-2 border rounded-md dark:bg-gray-800 dark:border-gray-600"
              required
            />
          </div>
          <input
            type="date"
            value={formData.expiryDate}
            onChange={(e) =>
              setFormData({ ...formData, expiryDate: e.target.value })
            }
            className="w-full p-2 border rounded-md dark:bg-gray-800 dark:border-gray-600"
          />
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-md"
          >
            {editingItem ? "Update Item" : "Save Item"}
          </button>
        </form>
      </Modal>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <Toast {...toast} onClose={() => setToast(null)} />
        </div>
      )}
    </div>
  );
};

export default Inventory;
