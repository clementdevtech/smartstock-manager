import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  BarChart3,
  PieChart as PieIcon,
} from "lucide-react";
import Card from "../components/Card";
import Toast from "../components/Toast";
import { api } from "../utils/api";

/* =====================================================
   Helpers
===================================================== */
const isWithinLast7Days = (date) => {
  const now = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(now.getDate() - 7);
  return new Date(date) >= sevenDaysAgo;
};

const Reports = () => {
  const [sales, setSales] = useState([]);
  const [items, setItems] = useState([]);
  const [toast, setToast] = useState(null);
  const storeId = localStorage.getItem("storeId"); 

  const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#8b5cf6"];

  /* =====================================================
     Fetch data
  ===================================================== */
  const fetchData = async () => {
    try {
      const salesRes = await api(`/api/sales?storeId=${storeId}`, "GET");
      const itemsRes = await api(`/api/items?storeId=${storeId}`, "GET");

      setSales(Array.isArray(salesRes) ? salesRes : []);
      setItems(Array.isArray(itemsRes) ? itemsRes : []);
    } catch (err) {
      console.error(err);
      setToast({ message: "Failed to load reports data", type: "error" });
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  /* =====================================================
     DAILY SALES (BAR CHART)
  ===================================================== */
  const salesByDate = sales.reduce((acc, sale) => {
    const date = new Date(sale.createdAt).toLocaleDateString();
    acc[date] = (acc[date] || 0) + sale.totalAmount;
    return acc;
  }, {});

  const dailyChartData = Object.entries(salesByDate).map(
    ([date, total]) => ({ date, total })
  );

  /* =====================================================
     WEEKLY TOP SELLING
  ===================================================== */
  const weeklySales = sales.filter((s) =>
    isWithinLast7Days(s.createdAt)
  );

  const itemSales = {};
  weeklySales.forEach((sale) => {
    sale.items.forEach((i) => {
      itemSales[i.name] = (itemSales[i.name] || 0) + i.quantity;
    });
  });

  const topItems = Object.entries(itemSales)
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  /* =====================================================
     LOW STOCK MAPPING
  ===================================================== */
  const lowStockMap = {};
  items.forEach((item) => {
    if (item.quantity <= (item.lowStockThreshold ?? 5)) {
      lowStockMap[item.name] = true;
    }
  });

  const weeklyTopVsLowStock = topItems.map((item) => ({
    ...item,
    lowStock: lowStockMap[item.name] || false,
  }));

  /* =====================================================
     KPIs
  ===================================================== */
  const totalRevenue = sales.reduce(
    (sum, s) => sum + s.totalAmount,
    0
  );

  const totalProfit = sales.reduce(
    (sum, s) => sum + s.totalProfit,
    0
  );

  const avgMargin = totalRevenue
    ? ((totalProfit / totalRevenue) * 100).toFixed(1)
    : 0;

  /* =====================================================
     UI
  ===================================================== */
  return (
    <div>
      <h1 className="text-xl font-semibold flex items-center gap-2 mb-6">
        <BarChart3 /> Reports & Analytics
      </h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card
          title="Total Revenue"
          value={`$${totalRevenue.toFixed(2)}`}
          icon={TrendingUp}
        />
        <Card
          title="Total Profit"
          value={`$${totalProfit.toFixed(2)}`}
        />
        <Card
          title="Avg Profit Margin"
          value={`${avgMargin}%`}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* DAILY SALES */}
        <div className="bg-white dark:bg-gray-900 border rounded-2xl p-5">
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
            <BarChart3 className="text-blue-600" />
            Daily Sales Trend
          </h2>

          {dailyChartData.length === 0 ? (
            <p className="text-gray-500 text-sm">No sales data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailyChartData}>
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="total" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* WEEKLY TOP vs LOW STOCK */}
        <div className="bg-white dark:bg-gray-900 border rounded-2xl p-5">
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
            <PieIcon className="text-red-500" />
            Weekly Top-Selling vs Low Stock
          </h2>

          {weeklyTopVsLowStock.length === 0 ? (
            <p className="text-gray-500 text-sm">No weekly sales yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={weeklyTopVsLowStock}
                  dataKey="quantity"
                  nameKey="name"
                  outerRadius={110}
                  label={({ name, lowStock }) =>
                    lowStock ? `${name} ⚠️` : name
                  }
                >
                  {weeklyTopVsLowStock.map((item, index) => (
                    <Cell
                      key={index}
                      fill={
                        item.lowStock
                          ? "#ef4444" // 🔴 critical
                          : COLORS[index % COLORS.length]
                      }
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
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

export default Reports;
