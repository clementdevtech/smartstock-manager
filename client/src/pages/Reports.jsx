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

const Reports = () => {
  const [sales, setSales] = useState([]);
  const [items, setItems] = useState([]);
  const [toast, setToast] = useState(null);

  const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6"];

  // ✅ Fetch sales + items
  const fetchData = async () => {
    try {
      const salesRes = await api("/api/sales", "GET");
      const itemsRes = await api("/api/items", "GET");

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

  // 📊 Sales grouped by date
  const salesByDate = sales.reduce((acc, sale) => {
    const date = new Date(sale.createdAt).toLocaleDateString();
    acc[date] = (acc[date] || 0) + sale.totalAmount;
    return acc;
  }, {});

  const dailyChartData = Object.entries(salesByDate).map(
    ([date, total]) => ({
      date,
      total,
    })
  );

  // 🥇 Top 5 selling items
  const itemSales = {};
  sales.forEach((sale) => {
    sale.items.forEach((i) => {
      itemSales[i.name] = (itemSales[i.name] || 0) + i.quantity;
    });
  });

  const topItems = Object.entries(itemSales)
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  // 💰 Revenue & profit
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

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <BarChart3 /> Reports & Analytics
        </h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card
          title="Total Revenue"
          value={`$${totalRevenue.toFixed(2)}`}
          icon={TrendingUp}
          trend={4}
        />
        <Card
          title="Total Profit"
          value={`$${totalProfit.toFixed(2)}`}
          trend={2}
        />
        <Card title="Avg Profit Margin" value={`${avgMargin}%`} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Daily Sales */}
        <div className="bg-white dark:bg-gray-900 border rounded-2xl shadow-sm p-5">
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Daily Sales Trend
          </h2>

          {dailyChartData.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No sales data yet.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailyChartData}>
                <XAxis dataKey="date" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip />
                <Bar
                  dataKey="total"
                  fill="#2563eb"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top Items */}
        <div className="bg-white dark:bg-gray-900 border rounded-2xl shadow-sm p-5">
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
            <PieIcon className="w-5 h-5 text-blue-600" />
            Top Selling Items
          </h2>

          {topItems.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No item data yet.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={topItems}
                  dataKey="quantity"
                  nameKey="name"
                  outerRadius={110}
                  label={({ name }) => name}
                >
                  {topItems.map((_, index) => (
                    <Cell
                      key={index}
                      fill={COLORS[index % COLORS.length]}
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
