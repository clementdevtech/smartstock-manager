import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { api } from "../../utils/api";

export default function LowStockPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadLowStock = async () => {
    try {
      const allItems = await api("/api/items", "GET");

      const low = allItems.filter(
        (i) => i.quantity <= (i.lowStockThreshold ?? 5)
      );

      setItems(low);
    } catch (err) {
      console.error("Failed to load low stock items", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLowStock();
  }, []);

  return (
    <div className="border rounded-xl p-4 bg-white dark:bg-gray-900">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="text-red-600" />
        <h2 className="text-lg font-semibold">Low Stock Alerts</h2>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading stock data...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-green-600">
          ✅ All items are sufficiently stocked
        </p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {items.map((item) => (
            <div
              key={item._id}
              className="flex justify-between items-center p-2 border rounded bg-red-50 dark:bg-red-900/20"
            >
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-xs text-gray-500">
                  SKU: {item.sku}
                </p>
              </div>

              <div className="text-right">
                <p className="text-sm font-semibold text-red-600">
                  {item.quantity} left
                </p>
                <p className="text-xs text-gray-500">
                  Min: {item.lowStockThreshold ?? 5}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
