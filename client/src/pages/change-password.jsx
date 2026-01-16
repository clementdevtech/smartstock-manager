import { useState } from "react";
import { api } from "../utils/api";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Toggles for password visibility
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleReset = async (e) => {
    e.preventDefault();
    setMessage("");

    if (newPassword !== confirm) {
      return setMessage("Passwords do not match.");
    }

    setLoading(true);

    try {
      await api("/api/auth/reset-password", "POST", {
        email,
        newPassword,
      });

      setMessage("Password changed successfully.");
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to reset password.");
    }

    setLoading(false);
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white shadow-lg rounded-lg p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4">Reset Password</h2>

        <form onSubmit={handleReset}>
          <label className="block mb-1 font-medium">Email</label>
          <input
            type="email"
            className="w-full border rounded p-2 mb-4"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label className="block mb-1 font-medium">New Password</label>
          <div className="relative mb-4">
            <input
              type={showNew ? "text" : "password"}
              className="w-full border rounded p-2 pr-10"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-600"
            >
              {showNew ? "Hide" : "Show"}
            </button>
          </div>

          <label className="block mb-1 font-medium">Confirm Password</label>
          <div className="relative mb-4">
            <input
              type={showConfirm ? "text" : "password"}
              className="w-full border rounded p-2 pr-10"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-600"
            >
              {showConfirm ? "Hide" : "Show"}
            </button>
          </div>

          <button
            disabled={loading}
            className="w-full bg-purple-600 text-white py-2 rounded hover:bg-purple-700"
          >
            {loading ? "Updating..." : "Change Password"}
          </button>
        </form>

        {message && <p className="text-center mt-4">{message}</p>}
      </div>
    </div>
  );
}
