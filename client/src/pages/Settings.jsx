import React, { useEffect, useState } from "react";
import {
  Building2,
  Palette,
  Bell,
  Lock,
  LogOut,
  Trash2,
  Database,
  CloudUpload,
  CloudDownload,
  Settings as GearIcon,
} from "lucide-react";

import Modal from "../components/Modal";
import ToggleSwitch from "../components/ToggleSwitch";
import Toast from "../components/Toast";

import { api } from "../utils/api";
import { useBusiness } from "../context/BusinessContext";

import { changePassword,
  getBusinessInfo,
  updateBusinessInfo,
} from "../services/settings";

const Settings = () => {
  const [profile, setProfile] = useState(null);
  const [toast, setToast] = useState(null);
  const { businessType, setBusinessType } = useBusiness();

  const [darkMode, setDarkMode] = useState(
    localStorage.getItem("theme") === "dark"
  );

  const [notifications, setNotifications] = useState({
    salesMilestones: true,
    stockWarnings: true,
    backupReminders: false,
    dailyReports: false,
    errorAlerts: true,
  });

  const [businessInfo, setBusinessInfo] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
  });

  const BUSINESS_TYPES = [
  "retail",
  "pharmacy",
  "restaurant",
  "wholesale",
  "electronics",
  "hardware",
];


  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showBusinessModal, setShowBusinessModal] = useState(false);

  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const isAdmin = profile?.role === "admin";

  /* ================================
     LOAD USER PROFILE
  ================================= */
  useEffect(() => {
    api("/api/users/profile", "GET")
      .then(setProfile)
      .catch(() =>
        setToast({ message: "Failed to load profile", type: "error" })
      );
  }, []);

  /* ================================
     LOAD BUSINESS INFO (ADMIN)
  ================================= */
  useEffect(() => {
    if (isAdmin) {
      getBusinessInfo()
        .then(setBusinessInfo)
        .catch(() =>
          setToast({
            message: "Failed to load business info",
            type: "error",
          })
        );
    }
  }, [isAdmin]);

  /* ================================
     THEME
  ================================= */
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  /* ================================
     PASSWORD CHANGE
  ================================= */
  const handlePasswordChange = async (e) => {
    e.preventDefault();

    if (passwords.newPassword !== passwords.confirmPassword) {
      return setToast({
        message: "Passwords do not match",
        type: "error",
      });
    }

    try {
      await changePassword({
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });

      setToast({
        message: "Password updated successfully",
        type: "success",
      });

      setPasswords({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

      setShowPasswordModal(false);
    } catch (err) {
      setToast({
        message: err.message || "Password update failed",
        type: "error",
      });
    }
  };

  /* ================================
     BUSINESS INFO UPDATE
  ================================= */
  const handleBusinessUpdate = async (e) => {
    e.preventDefault();
    try {
      await updateBusinessInfo(businessInfo);
      setToast({
        message: "Business info updated",
        type: "success",
      });
      setShowBusinessModal(false);
    } catch {
      setToast({
        message: "Failed to update business info",
        type: "error",
      });
    }
  };

  /* ================================
     BACKUP & RESTORE
  ================================= */
  const handleBackup = async () => {
    await api("/api/backup/backup", "POST");
    setToast({ message: "Backup completed", type: "success" });
  };

  const handleRestore = async () => {
    if (!window.confirm("Restore system data?")) return;
    await api("/api/backup/restore", "POST");
    setToast({ message: "System restored", type: "success" });
  };

  /* ================================
     LOGOUT
  ================================= */
  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <GearIcon className="text-blue-600" /> Settings
      </h1>

      {/* ===== APPEARANCE ===== */}
      <div className="card">
        <h2 className="section-title flex items-center gap-2">
          <Palette /> Appearance
        </h2>

        <select
          value={darkMode ? "dark" : "light"}
          onChange={(e) => setDarkMode(e.target.value === "dark")}
          className="input"
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>

      {/* ===== NOTIFICATIONS ===== */}
      <div className="card">
        <h2 className="section-title flex items-center gap-2">
          <Bell /> Notifications
        </h2>

        <ToggleSwitch
          label="Low stock alerts"
          checked={notifications.stockWarnings}
          onChange={(v) =>
            setNotifications({ ...notifications, stockWarnings: v })
          }
        />

        <ToggleSwitch
          label="Sales milestones"
          checked={notifications.salesMilestones}
          onChange={(v) =>
            setNotifications({ ...notifications, salesMilestones: v })
          }
        />
      </div>

      {/* ===== BUSINESS INFO (ADMIN ONLY) ===== */}
      {isAdmin && (
        <div className="card">
          <h2 className="section-title flex items-center gap-2">
            <Building2 /> Business Info
          </h2>

          <p className="text-sm text-gray-500">
            {businessInfo.name}
          </p>

          <button
            onClick={() => setShowBusinessModal(true)}
            className="btn-primary mt-3"
          >
            Edit Business Info
          </button>
        </div>
      )}



        {/* ===== BUSINESS TYPE (ADMIN ONLY) ===== */}

  <div className="card">
    <label className="block mb-1 font-medium">Business Type</label>
    <select
      value={businessType}
      onChange={(e) => setBusinessType(e.target.value)}
      className="w-full p-2 border rounded-md"
    >
      {BUSINESS_TYPES.map((type) => (
        <option key={type} value={type}>
          {type.charAt(0).toUpperCase() + type.slice(1)}
        </option>
      ))}
    </select>
  </div>


      {/* ===== BACKUP (ADMIN ONLY) ===== */}
      {isAdmin && (
        <div className="card">
          <h2 className="section-title flex items-center gap-2">
            <Database /> Data Management
          </h2>

          <div className="flex gap-3">
            <button onClick={handleBackup} className="btn-primary">
              <CloudUpload size={16} /> Backup
            </button>

            <button onClick={handleRestore} className="btn-secondary">
              <CloudDownload size={16} /> Restore
            </button>
          </div>
        </div>
      )}

      {/* ===== SECURITY ===== */}
      <div className="card">
        <h2 className="section-title flex items-center gap-2">
          <Lock /> Security
        </h2>

        <div className="flex gap-3">
          <button
            onClick={() => setShowPasswordModal(true)}
            className="btn-primary"
          >
            Change Password
          </button>

          <button onClick={handleLogout} className="btn-secondary">
            <LogOut size={16} /> Logout
          </button>

          {isAdmin && (
            <button className="btn-danger">
              <Trash2 size={16} /> Delete Account
            </button>
          )}
        </div>
      </div>

      {/* ===== PASSWORD MODAL ===== */}
      <Modal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        title="Change Password"
      >
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <input
            type="password"
            placeholder="Current password"
            value={passwords.currentPassword}
            onChange={(e) =>
              setPasswords({ ...passwords, currentPassword: e.target.value })
            }
            className="input"
            required
          />
          <input
            type="password"
            placeholder="New password"
            value={passwords.newPassword}
            onChange={(e) =>
              setPasswords({ ...passwords, newPassword: e.target.value })
            }
            className="input"
            required
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={passwords.confirmPassword}
            onChange={(e) =>
              setPasswords({
                ...passwords,
                confirmPassword: e.target.value,
              })
            }
            className="input"
            required
          />
          <button className="btn-primary w-full">Save</button>
        </form>
      </Modal>

      {/* ===== BUSINESS MODAL ===== */}
      <Modal
        isOpen={showBusinessModal}
        onClose={() => setShowBusinessModal(false)}
        title="Edit Business Info"
      >
        <form onSubmit={handleBusinessUpdate} className="space-y-4">
          <input
            className="input"
            placeholder="Business Name"
            value={businessInfo.name}
            onChange={(e) =>
              setBusinessInfo({ ...businessInfo, name: e.target.value })
            }
          />
          <input
            className="input"
            placeholder="Address"
            value={businessInfo.address}
            onChange={(e) =>
              setBusinessInfo({ ...businessInfo, address: e.target.value })
            }
          />
          <input
            className="input"
            placeholder="Phone"
            value={businessInfo.phone}
            onChange={(e) =>
              setBusinessInfo({ ...businessInfo, phone: e.target.value })
            }
          />
          <input
            className="input"
            placeholder="Email"
            value={businessInfo.email}
            onChange={(e) =>
              setBusinessInfo({ ...businessInfo, email: e.target.value })
            }
          />
          <button className="btn-primary w-full">Save</button>
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

export default Settings;
