import React, { useEffect, useState } from "react";
import {
  PlusCircle,
  Trash2,
  Edit3,
  Package,
  Search,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import { api } from "../utils/api";

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

  // ✅ Fetch items
  const fetchItems = async () => {
    try {
      setLoading(true);
      const res = await api("/api/items", "GET");
      const data = Array.isArray(res)
        ? res
        : Array.isArray(res?.items)
        ? res.items
        : [];

      setItems(data);
      setFiltered(data);
    } catch (err) {
      console.error(err);
      setToast({ message: "Failed to fetch items", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // ✅ Add or update item
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await api(`/api/items/${editingItem._id}`, "PUT", formData);
        setToast({ message: "Item updated successfully", type: "success" });
      } else {
        await api("/api/items", "POST", formData);
        setToast({ message: "Item added successfully", type: "success" });
      }

      setShowModal(false);
      setEditingItem(null);
      setFormData({
        name: "",
        category: "other",
        wholesalePrice: "",
        retailPrice: "",
        quantity: "",
        entryDate: "",
        expiryDate: "",
      });

      fetchItems();
    } catch (err) {
      console.error(err);
      setToast({ message: "Action failed", type: "error" });
    }
  };

  // ✅ Delete item
  const handleDelete = async (id) => {
    if (!window.confirm("Delete this item?")) return;
    try {
      await api(`/api/items/${id}`, "DELETE");
      setToast({ message: "Item deleted", type: "warning" });
      fetchItems();
    } catch (err) {
      console.error(err);
      setToast({ message: "Error deleting item", type: "error" });
    }
  };

  // ✅ Search
  useEffect(() => {
    const f = items.filter((i) =>
      i.name.toLowerCase().includes(search.toLowerCase())
    );
    setFiltered(f);
  }, [search, items]);

  useEffect(() => {
    fetchItems();
  }, []);

  // ✅ Stats
  const totalStock = items.reduce((s, i) => s + Number(i.quantity), 0);
  const totalValue = items.reduce(
    (s, i) => s + i.quantity * i.retailPrice,
    0
  );
  const totalProfit = items.reduce(
    (s, i) => s + i.quantity * (i.retailPrice - i.wholesalePrice),
    0
  );

  const lowStock = (q) => q < 5;

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Package className="text-blue-600" /> Inventory Management
        </h1>
        <button
          onClick={() => {
            setEditingItem(null);
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
        >
          <PlusCircle size={18} /> Add Item
        </button>
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-100 dark:bg-blue-900/30 p-4 rounded-xl">
          <span>Total Stock</span>
          <div className="font-bold text-blue-600">{totalStock}</div>
        </div>
        <div className="bg-green-100 dark:bg-green-900/30 p-4 rounded-xl">
          <span>Total Value</span>
          <div className="font-bold text-green-600">
            ${totalValue.toFixed(2)}
          </div>
        </div>
        <div className="bg-yellow-100 dark:bg-yellow-900/30 p-4 rounded-xl">
          <span>Total Profit</span>
          <div className="font-bold text-yellow-600">
            ${totalProfit.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 mb-4">
        <Search size={18} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items..."
          className="w-full p-2 border rounded-md dark:bg-gray-800"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto bg-white dark:bg-gray-900 rounded-xl border">
        {loading ? (
          <div className="p-6 flex justify-center">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        ) : filtered.length ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-gray-800">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Category</th>
                <th className="p-3">Qty</th>
                <th className="p-3">Wholesale</th>
                <th className="p-3">Retail</th>
                <th className="p-3">Profit</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const profit = i.retailPrice - i.wholesalePrice;
                return (
                  <tr
                    key={i._id}
                    className={`border-t ${
                      lowStock(i.quantity)
                        ? "bg-red-50 dark:bg-red-900/20"
                        : ""
                    }`}
                  >
                    <td className="p-3 font-medium">{i.name}</td>
                    <td className="p-3 capitalize">{i.category}</td>
                    <td className="p-3 flex items-center gap-1">
                      {i.quantity}
                      {lowStock(i.quantity) && (
                        <AlertTriangle size={16} className="text-red-500" />
                      )}
                    </td>
                    <td className="p-3">${i.wholesalePrice}</td>
                    <td className="p-3">${i.retailPrice}</td>
                    <td className="p-3 text-green-600">
                      ${profit.toFixed(2)}
                    </td>
                    <td className="p-3 flex gap-2 justify-end">
                      <button
                        onClick={() => {
                          setEditingItem(i);
                          setFormData(i);
                          setShowModal(true);
                        }}
                        className="text-blue-600"
                      >
                        <Edit3 size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(i._id)}
                        className="text-red-600"
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
          <div className="p-6 text-center text-gray-500">
            No items found.
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingItem ? "Edit Item" : "Add Item"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            value={formData.name}
            onChange={(e) =>
              setFormData({ ...formData, name: e.target.value })
            }
            placeholder="Item Name"
            className="w-full p-2 border rounded-md"
            required
          />

          <select
            value={formData.category}
            onChange={(e) =>
              setFormData({ ...formData, category: e.target.value })
            }
            className="w-full p-2 border rounded-md"
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
              placeholder="Wholesale"
              value={formData.wholesalePrice}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  wholesalePrice: e.target.value,
                })
              }
              className="w-1/2 p-2 border rounded-md"
              required
            />
            <input
              type="number"
              placeholder="Retail"
              value={formData.retailPrice}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  retailPrice: e.target.value,
                })
              }
              className="w-1/2 p-2 border rounded-md"
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
              className="w-1/2 p-2 border rounded-md"
              required
            />
            <input
              type="date"
              value={formData.entryDate}
              onChange={(e) =>
                setFormData({ ...formData, entryDate: e.target.value })
              }
              className="w-1/2 p-2 border rounded-md"
              required
            />
          </div>

          <input
            type="date"
            value={formData.expiryDate}
            onChange={(e) =>
              setFormData({ ...formData, expiryDate: e.target.value })
            }
            className="w-full p-2 border rounded-md"
          />

          <button className="w-full bg-blue-600 text-white py-2 rounded-md">
            {editingItem ? "Update Item" : "Save Item"}
          </button>
        </form>
      </Modal>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <Toast {...toast} onClose={() => setToast(null)} />
        </div>
      )}
    </div>
  );
};

export default Inventory;
