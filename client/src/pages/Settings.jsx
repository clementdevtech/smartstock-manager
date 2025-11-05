import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  User,
  Bell,
  Palette,
  Shield,
  Lock,
  LogOut,
  Trash2,
  Moon,
  Sun,
  Layout,
  Database,
  Building2,
  CloudUpload,
  CloudDownload,
  Settings as GearIcon,
  Wifi,
} from "lucide-react";
import ToggleSwitch from "../components/ToggleSwitch";
import Toast from "../components/Toast";
import Modal from "../components/Modal";

const Settings = () => {
  const [profile, setProfile] = useState({});
  const [toast, setToast] = useState(null);
  const [darkMode, setDarkMode] = useState(localStorage.getItem("theme") === "dark");
  const [compactMode, setCompactMode] = useState(localStorage.getItem("compactMode") === "true");
  const [notifications, setNotifications] = useState({
    salesAlerts: true,
    stockWarnings: true,
    backupReminders: false,
    salesMilestones: true,
    dailyReports: false,
    errorAlerts: true,
  });
  const [businessInfo, setBusinessInfo] = useState({
    name: "Coco SmartStock",
    address: "Nairobi, Kenya",
    phone: "+254 712 345 678",
    email: "info@cocostock.co.ke",
  });
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showEditBusinessModal, setShowEditBusinessModal] = useState(false);
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  // Fetch user profile
  const fetchProfile = async () => {
    try {
      const res = await axios.get("/api/users/profile", { headers });
      setProfile(res.data);
    } catch {
      setToast({ message: "Failed to load profile", type: "error" });
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  // Theme toggle
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  // Compact mode toggle
  useEffect(() => {
    document.body.classList.toggle("compact", compactMode);
    localStorage.setItem("compactMode", compactMode);
  }, [compactMode]);

  const handlePasswordChange = (e) => {
    e.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      return setToast({ message: "Passwords do not match", type: "error" });
    }
    setToast({ message: "Password changed successfully (mock)", type: "success" });
    setShowPasswordModal(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.href = "/";
  };

  const handleDeleteAccount = () => {
    if (!window.confirm("Are you sure you want to delete your account permanently?")) return;
    setToast({ message: "Account deleted (mock)", type: "warning" });
  };

  const handleBusinessUpdate = (e) => {
    e.preventDefault();
    setToast({ message: "Business info updated successfully", type: "success" });
    setShowEditBusinessModal(false);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-800 dark:text-gray-100">
          <GearIcon className="text-blue-600" /> System Settings
        </h1>
      </div>

      {/* ===== BUSINESS INFO ===== */}
      <div className="card">
        <h2 className="section-title flex items-center gap-2">
          <Building2 className="text-blue-600" /> Business Info
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div>
            <p className="label">Business Name</p>
            <p className="value">{businessInfo.name}</p>
          </div>
          <div>
            <p className="label">Email</p>
            <p className="value">{businessInfo.email}</p>
          </div>
          <div>
            <p className="label">Address</p>
            <p className="value">{businessInfo.address}</p>
          </div>
          <div>
            <p className="label">Phone</p>
            <p className="value">{businessInfo.phone}</p>
          </div>
        </div>
        <button
          onClick={() => setShowEditBusinessModal(true)}
          className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg"
        >
          Edit Business Info
        </button>
      </div>

      {/* ===== APPEARANCE SETTINGS ===== */}
      <div className="card">
        <h2 className="section-title flex items-center gap-2">
          <Palette className="text-blue-600" /> Appearance & Display
        </h2>
        <div className="space-y-6">
          {/* Theme Mode */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              Theme Mode
            </label>
            <select
              value={darkMode ? "dark" : "light"}
              onChange={(e) => setDarkMode(e.target.value === "dark")}
              className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-100"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="auto">Auto (Match System)</option>
            </select>
          </div>

          {/* Accent Color */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              Accent Color
            </label>
            <div className="flex items-center gap-3">
              {["blue", "green", "purple", "red"].map((color) => (
                <button
                  key={color}
                  onClick={() => {
                    document.documentElement.style.setProperty("--accent-color", color);
                    localStorage.setItem("accentColor", color);
                    setToast({ message: `Accent color changed to ${color}`, type: "success" });
                  }}
                  className={`w-8 h-8 rounded-full border-2 transition ${
                    localStorage.getItem("accentColor") === color
                      ? "border-gray-900 dark:border-white scale-110"
                      : "border-gray-300"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              Font Size
            </label>
            <select
              onChange={(e) => {
                document.documentElement.style.fontSize = e.target.value;
                localStorage.setItem("fontSize", e.target.value);
              }}
              defaultValue={localStorage.getItem("fontSize") || "16px"}
              className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-100"
            >
              <option value="14px">Small</option>
              <option value="16px">Medium</option>
              <option value="18px">Large</option>
            </select>
          </div>

          {/* Layout Density */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              Layout Density
            </label>
            <select
              value={compactMode ? "compact" : "comfortable"}
              onChange={(e) => setCompactMode(e.target.value === "compact")}
              className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-100"
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </div>
        </div>
      </div>

      {/* ===== NOTIFICATIONS SETTINGS ===== */}
      <div className="card">
        <h2 className="section-title flex items-center gap-2">
          <Bell className="text-blue-600" /> Notifications & Alerts
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ToggleSwitch
            checked={notifications.salesMilestones}
            onChange={(val) => setNotifications({ ...notifications, salesMilestones: val })}
            label="Sales Milestone Alerts"
          />
          <ToggleSwitch
            checked={notifications.stockWarnings}
            onChange={(val) => setNotifications({ ...notifications, stockWarnings: val })}
            label="Low Stock Alerts"
          />
          <ToggleSwitch
            checked={notifications.backupReminders}
            onChange={(val) => setNotifications({ ...notifications, backupReminders: val })}
            label="Backup Status Alerts"
          />
          <ToggleSwitch
            checked={notifications.dailyReports}
            onChange={(val) => setNotifications({ ...notifications, dailyReports: val })}
            label="Daily Summary Email"
          />
          <ToggleSwitch
            checked={notifications.errorAlerts}
            onChange={(val) => setNotifications({ ...notifications, errorAlerts: val })}
            label="Critical Error Alerts"
          />
        </div>

        {/* Notification Method */}
        <div className="mt-6">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
            Notification Method
          </label>
          <select
            onChange={(e) => localStorage.setItem("notificationMethod", e.target.value)}
            defaultValue={localStorage.getItem("notificationMethod") || "in-app"}
            className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-100"
          >
            <option value="in-app">In-App Only</option>
            <option value="email">Email Only</option>
            <option value="both">Both In-App and Email</option>
          </select>
        </div>
      </div>

      {/* ===== SYSTEM ===== */}
      <div className="card">
        <h2 className="section-title flex items-center gap-2">
          <Database className="text-blue-600" /> Data Management
        </h2>
        <div className="flex flex-wrap gap-4">
          <button className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg">
            <CloudUpload size={18} /> Backup Now
          </button>
          <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg">
            <CloudDownload size={18} /> Restore Data
          </button>
        </div>
      </div>

      {/* ===== SECURITY ===== */}
      <div className="card">
        <h2 className="section-title flex items-center gap-2">
          <Lock className="text-blue-600" /> Security
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowPasswordModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Lock size={16} /> Change Password
          </button>
          <button
            onClick={handleLogout}
            className="btn-secondary flex items-center gap-2"
          >
            <LogOut size={16} /> Logout
          </button>
          <button
            onClick={handleDeleteAccount}
            className="btn-danger flex items-center gap-2"
          >
            <Trash2 size={16} /> Delete Account
          </button>
        </div>
      </div>

      {/* ===== INTEGRATIONS ===== */}
      <div className="card">
        <h2 className="section-title flex items-center gap-2">
          <Wifi className="text-blue-600" /> Integrations
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
          Connect SmartStock with external apps or devices.
        </p>
        <div className="flex flex-wrap gap-3">
          <button className="btn-secondary">Connect POS Machine</button>
          <button className="btn-secondary">Sync Cloud Storage</button>
          <button className="btn-secondary">Link Accounting App</button>
        </div>
      </div>

      {/* ===== PASSWORD MODAL ===== */}
      <Modal isOpen={showPasswordModal} onClose={() => setShowPasswordModal(false)} title="Change Password">
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <input
            type="password"
            placeholder="Current Password"
            value={passwords.currentPassword}
            onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
            className="input"
            required
          />
          <input
            type="password"
            placeholder="New Password"
            value={passwords.newPassword}
            onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
            className="input"
            required
          />
          <input
            type="password"
            placeholder="Confirm New Password"
            value={passwords.confirmPassword}
            onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
            className="input"
            required
          />
          <button type="submit" className="btn-primary w-full">Save Changes</button>
        </form>
      </Modal>

      {/* ===== EDIT BUSINESS MODAL ===== */}
      <Modal isOpen={showEditBusinessModal} onClose={() => setShowEditBusinessModal(false)} title="Edit Business Info">
        <form onSubmit={handleBusinessUpdate} className="space-y-4">
          <input
            type="text"
            placeholder="Business Name"
            value={businessInfo.name}
            onChange={(e) => setBusinessInfo({ ...businessInfo, name: e.target.value })}
            className="input"
          />
          <input
            type="text"
            placeholder="Address"
            value={businessInfo.address}
            onChange={(e) => setBusinessInfo({ ...businessInfo, address: e.target.value })}
            className="input"
          />
          <input
            type="text"
            placeholder="Phone"
            value={businessInfo.phone}
            onChange={(e) => setBusinessInfo({ ...businessInfo, phone: e.target.value })}
            className="input"
          />
          <input
            type="email"
            placeholder="Email"
            value={businessInfo.email}
            onChange={(e) => setBusinessInfo({ ...businessInfo, email: e.target.value })}
            className="input"
          />
          <button type="submit" className="btn-primary w-full">Save</button>
        </form>
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

export default Settings;
