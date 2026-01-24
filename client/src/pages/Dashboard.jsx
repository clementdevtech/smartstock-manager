import UserManagement from "../components/admin/UserManagement";
import LowStockPanel from "../components/admin/LowStockPanel";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>

      {/* 🔴 Low Stock Alerts */}
      <LowStockPanel />

      {/* 👥 User Management */}
      <UserManagement />
    </div>
  );
}