import React, { useEffect, useMemo, useState } from "react";
import {
  PlusCircle,
  Trash2,
  Edit3,
  Package,
  Search,
  AlertTriangle,
  Loader2,
  Barcode,
} from "lucide-react";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import { api } from "../utils/api";
import { useBusiness } from "../context/BusinessContext";
import CameraScanner from "../components/CameraScanner";

/* =====================================================
   Dynamic Default Form Based On Business Type
===================================================== */
const getDefaultForm = (businessType) => {
  const base = {
    name: "",
    sku: "",
    supplier: "",
    wholesalePrice: "",
    retailPrice: "",
    quantity: "",
    lowStockThreshold: 5,
    entryDate: "",
    expiryDate: "",
  };

  switch (businessType) {
    case "restaurant":
      return {
        ...base,
        category: "ingredient",
        unit: "kg",
        storageLocation: "",
      };

    case "pharmacy":
      return {
        ...base,
        category: "medicine",
        unit: "box",
        batchNumber: "",
      };

    case "wholesale":
      return {
        ...base,
        category: "bulk",
        unit: "carton",
        minimumOrder: "",
      };

    default:
      return {
        ...base,
        category: "general",
        unit: "pcs",
      };
  }
};

const Inventory = () => {
  const { businessType } = useBusiness();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState(getDefaultForm(businessType));

  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");
  const [showScanner, setShowScanner] = useState(false);

  const storeId = localStorage.getItem("storeId"); 
  console.log("Current store ID:", storeId);

  /* =====================================================
     Reset form when business type changes
  ===================================================== */
  useEffect(() => {
    setFormData(getDefaultForm(businessType));
  }, [businessType]);

  /* =====================================================
     Fetch Inventory (Hybrid-safe)
  ===================================================== */
  const fetchItems = async () => {
    try {
      setLoading(true);
      const res = await api("/api/items", "GET");
      setItems(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error(err);
      setToast({ message: "Failed to load inventory", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  /* =====================================================
     Business-aware Search
  ===================================================== */
  const filteredItems = useMemo(() => {
    if (!search) return items;

    return items.filter((i) =>
      `
      ${i.name}
      ${i.sku || ""}
      ${i.batchNumber || ""}
      ${i.storageLocation || ""}
      `
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  }, [search, items]);

  /* =====================================================
     Stats (Hybrid safe numeric parsing)
  ===================================================== */
  const stats = useMemo(() => {
    return items.reduce(
      (acc, i) => {
        const qty = Number(i.quantity || 0);
        const retail = Number(i.retailPrice || 0);
        const wholesale = Number(i.wholesalePrice || 0);

        acc.totalStock += qty;
        acc.totalValue += qty * retail;
        acc.totalProfit += qty * (retail - wholesale);

        return acc;
      },
      { totalStock: 0, totalValue: 0, totalProfit: 0 }
    );
  }, [items]);

  const isLowStock = (item) =>
    Number(item.quantity) <= Number(item.lowStockThreshold || 5);

  /* =====================================================
     Save Item
  ===================================================== */
const handleSubmit = async (e) => {
  e.preventDefault();

  try {
    /* ================================
       ENTERPRISE VALIDATION
    ================================= */

    if (!storeId) {
      return setToast({
        message: "Store not configured. Please select a store.",
        type: "error",
      });
    }

    if (Number(formData.wholesalePrice) < 0)
      return setToast({ message: "Wholesale price cannot be negative", type: "error" });

    if (Number(formData.retailPrice) < 0)
      return setToast({ message: "Retail price cannot be negative", type: "error" });

    if (Number(formData.quantity) < 0)
      return setToast({ message: "Quantity cannot be negative", type: "error" });

    /* ================================
       DUPLICATE SKU PROTECTION
    ================================= */

    if (formData.sku) {
      const duplicate = items.find(
        (i) =>
          i.sku === formData.sku &&
          i._id !== editingItem?._id &&
          i.storeId === storeId
      );

      if (duplicate) {
        return setToast({
          message: "This barcode already exists in this store",
          type: "error",
        });
      }
    }

    /* ================================
       NORMALIZE NUMBERS
    ================================= */

    const payload = {
      ...formData,
      wholesalePrice: Number(formData.wholesalePrice),
      retailPrice: Number(formData.retailPrice),
      quantity: Number(formData.quantity),
      lowStockThreshold: Number(formData.lowStockThreshold || 0),
      businessType,
      storeId,
    };

    /* ================================
       SAVE ITEM
    ================================= */

    let savedItem;

    if (editingItem) {
      savedItem = await api(`/api/items/${editingItem._id}`, "PUT", payload);

      setToast({
        message: "Item updated successfully",
        type: "success",
      });

      /* OPTIMISTIC UPDATE */
      setItems((prev) =>
        prev.map((i) =>
          i._id === editingItem._id ? { ...i, ...payload } : i
        )
      );
    } else {
      savedItem = await api("/api/items", "POST", payload);

      setToast({
        message: "Item added successfully",
        type: "success",
      });

      /* OPTIMISTIC INSERT */
      setItems((prev) => [
        savedItem || { _id: crypto.randomUUID(), ...payload },
        ...prev,
      ]);
    }

    /* ================================
       STOCK MOVEMENT AUDIT LOG
    ================================= */
/*
    try {
      await api("/api/items/stock-movements", "POST", {
        productId: savedItem?._id || editingItem?._id,
        quantity: payload.quantity,
        type: editingItem ? "adjustment" : "initial_stock",
        storeId,
        reference: editingItem ? "manual update" : "item creation",
      });
    } catch (auditErr) {
      console.warn("Stock movement log failed:", auditErr.message);
    }*/

    /* ================================
       RESET FORM
    ================================= */

    setShowModal(false);
    setEditingItem(null);
    setFormData(getDefaultForm(businessType));

    /* OPTIONAL background sync */
    fetchItems();

  } catch (err) {
    console.error("SAVE ITEM ERROR:", err);

    setToast({
      message: err?.message || "Failed to save item",
      type: "error",
    });
  }
};

  /* =====================================================
     Delete Item
  ===================================================== */
  const handleDelete = async (id) => {
    if (!window.confirm("Delete this item permanently?")) return;

    try {
      await api(`/api/items/${id}`, "DELETE");
      setToast({ message: "Item deleted", type: "warning" });
      fetchItems();
    } catch (err) {
      console.error(err);
      setToast({ message: "Delete failed", type: "error" });
    }
  };

  /* =====================================================
     UI
  ===================================================== */
  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Package className="text-blue-600" />
          Inventory ({businessType})
        </h1>

        <button
          onClick={() => {
            setEditingItem(null);
            setFormData(getDefaultForm(businessType));
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
        >
          <PlusCircle size={18} /> Add Item
        </button>
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Stat label="Total Stock" value={stats.totalStock} />
        <Stat label="Stock Value" value={`$${stats.totalValue.toFixed(2)}`} />
        <Stat
          label="Estimated Profit"
          value={`$${stats.totalProfit.toFixed(2)}`}
        />
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <Search size={18} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search inventory..."
          className="w-full p-2 border rounded-md dark:bg-gray-800"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto bg-white dark:bg-gray-900 rounded-xl border">
        {loading ? (
          <div className="p-6 flex justify-center">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        ) : filteredItems.length ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-gray-800">
              <tr>
                <th className="p-3 text-left">Item</th>
                <th className="p-3">Qty</th>
                <th className="p-3">Unit</th>
                <th className="p-3">Cost</th>
                <th className="p-3">Price</th>
                <th className="p-3">Profit</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((i) => {
                const profit =
                  Number(i.retailPrice) - Number(i.wholesalePrice);

                return (
                  <tr
                    key={i._id}
                    className={`border-t ${
                      isLowStock(i)
                        ? "bg-red-50 dark:bg-red-900/20"
                        : ""
                    }`}
                  >
                    <td className="p-3">
                      <div className="font-medium">{i.name}</div>

                      {i.sku && (
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                          <Barcode size={12} /> {i.sku}
                        </div>
                      )}

                      {i.batchNumber && (
                        <div className="text-xs text-purple-500">
                          Batch: {i.batchNumber}
                        </div>
                      )}
                    </td>

                    <td className="p-3 text-center">
                      {i.quantity}
                      {isLowStock(i) && (
                        <AlertTriangle
                          size={14}
                          className="text-red-500 inline ml-1"
                        />
                      )}
                    </td>

                    <td className="p-3 text-center">{i.unit}</td>
                    <td className="p-3 text-center">${i.wholesalePrice}</td>
                    <td className="p-3 text-center">${i.retailPrice}</td>
                    <td className="p-3 text-center text-green-600">
                      ${profit.toFixed(2)}
                    </td>

                    <td className="p-3 flex gap-2 justify-end">
                      <button
                        onClick={() => {
                          setEditingItem(i);
                          setFormData({ ...getDefaultForm(businessType), ...i });
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
            No inventory items found.
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingItem ? "Edit Item" : "Add Item"}
      >
        <InventoryForm
          formData={formData}
          setFormData={setFormData}
          onSubmit={handleSubmit}
          editing={!!editingItem}
          businessType={businessType}
          showScanner={showScanner}
          setShowScanner={setShowScanner}
        />
      </Modal>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <Toast {...toast} onClose={() => setToast(null)} />
        </div>
      )}
    </div>
  );
};

/* =====================================================
   Components
===================================================== */

const Stat = ({ label, value }) => (
  <div className="bg-blue-100 dark:bg-blue-900/30 p-4 rounded-xl">
    <span className="text-sm">{label}</span>
    <div className="font-bold text-blue-600">{value}</div>
  </div>
);

const InventoryForm = ({
formData,
setFormData,
onSubmit,
editing,
businessType,
showScanner,
setShowScanner,
}) => (

  <form onSubmit={onSubmit} className="space-y-3">


{/* Item Name */}
<input
  value={formData.name}
  onChange={(e) =>
    setFormData({ ...formData, name: e.target.value })
  }
  placeholder="Item name"
  className="w-full p-2 border rounded-md"
  required
/>

{/* SKU + Scanner */}
<div className="space-y-2">
  <div className="flex gap-2">
    <input
      value={formData.sku}
      onChange={(e) =>
        setFormData({ ...formData, sku: e.target.value })
      }
      placeholder="SKU / Barcode"
      className="w-full p-2 border rounded-md"
    />

    <button
      type="button"
      onClick={() => setShowScanner(true)}
      className="px-4 bg-gray-200 hover:bg-gray-300 rounded-md font-medium"
    >
      Scan
    </button>
  </div>

  {/* Camera Scanner */}
  {showScanner && (
    <div className="space-y-2 border rounded-lg p-2 bg-black/5">
      <CameraScanner
        onDetected={(code, product) => {
           setFormData({
               ...formData,
                 sku: code,
           name: product?.name || formData.name,
         });
      }}
     onClose={() => setShowScanner(false)}
   />


      
    </div>
  )}
</div>

{/* Pharmacy */}
{businessType === "pharmacy" && (
  <input
    value={formData.batchNumber || ""}
    onChange={(e) =>
      setFormData({ ...formData, batchNumber: e.target.value })
    }
    placeholder="Batch Number"
    className="w-full p-2 border rounded-md"
  />
)}

{/* Restaurant */}
{businessType === "restaurant" && (
  <input
    value={formData.storageLocation || ""}
    onChange={(e) =>
      setFormData({ ...formData, storageLocation: e.target.value })
    }
    placeholder="Storage Location"
    className="w-full p-2 border rounded-md"
  />
)}

{/* Prices */}
<div className="grid grid-cols-2 gap-3">
  <input
    type="number"
    placeholder="Wholesale price"
    value={formData.wholesalePrice}
    onChange={(e) =>
      setFormData({
        ...formData,
        wholesalePrice: e.target.value,
      })
    }
    className="p-2 border rounded-md"
    required
  />

  <input
    type="number"
    placeholder="Retail price"
    value={formData.retailPrice}
    onChange={(e) =>
      setFormData({
        ...formData,
        retailPrice: e.target.value,
      })
    }
    className="p-2 border rounded-md"
    required
  />
</div>

{/* Quantity */}
<div className="grid grid-cols-2 gap-3">
  <input
    type="number"
    placeholder="Quantity"
    value={formData.quantity}
    onChange={(e) =>
      setFormData({ ...formData, quantity: e.target.value })
    }
    className="p-2 border rounded-md"
    required
  />

  <input
    type="number"
    placeholder="Low stock alert"
    value={formData.lowStockThreshold}
    onChange={(e) =>
      setFormData({
        ...formData,
        lowStockThreshold: e.target.value,
      })
    }
    className="p-2 border rounded-md"
  />
</div>

{/* Submit */}
<button className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md font-medium">
  {editing ? "Update Item" : "Save Item"}
</button>

  </form>
);


export default Inventory;
