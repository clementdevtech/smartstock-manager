import UserManagement from "../components/admin/UserManagement";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>
      <UserManagement />
    </div>
  );
}
