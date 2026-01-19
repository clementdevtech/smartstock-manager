import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../utils/api";

export default function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleReset = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!token) {
      return setMessage("Invalid or expired reset link.");
    }

    if (newPassword !== confirm) {
      return setMessage("Passwords do not match.");
    }

    setLoading(true);

    try {
      await api("/api/auth/reset-password", "POST", {
        newPassword,
        token,
      });

      setMessage("Password updated successfully. Redirecting to login...");
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to reset password.");
    }

    setLoading(false);
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white shadow-lg rounded-lg p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4 text-center">
          Reset Password
        </h2>

        <form onSubmit={handleReset}>
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
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600"
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
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600"
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

        {message && (
          <p className="text-center mt-4 text-sm text-gray-700">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
