import UserManagement from "../components/admin/UserManagement";
import LowStockPanel from "../components/admin/LowStockPanel";
import SalesTargetPanel from "../components/admin/SalesTargetPanel";
import TargetProgressPanel from "../components/admin/TargetProgressPanel";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>

      {/* 🔴 Low Stock Alerts */}
      <LowStockPanel />

      {/* 🎯 Sales Targets */}
      <SalesTargetPanel />

      {/* 📊 Target Progress */}
      <TargetProgressPanel />

      {/* 👥 User Management */}
      <UserManagement />
    </div>
  );
}
