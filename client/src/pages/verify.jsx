import { useState, useEffect } from "react";
import { verifyEmailCode, resendCode } from "../services/auth";
import { useNavigate } from "react-router-dom";

export default function VerifyCodePage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [resendTimer, setResendTimer] = useState(30);

  const navigate = useNavigate();

  // Countdown effect for resend button
  useEffect(() => {
    if (!codeSent || resendTimer === 0) return;
    const interval = setInterval(() => setResendTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [codeSent, resendTimer]);

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await verifyEmailCode(email, code);

      if (res.verified) {
        setMessage("Email verified! Redirecting to reset password...");
        setTimeout(() => {
          navigate(`/reset-password/${email}`);
        }, 1500);
      } else {
        setMessage("Invalid or expired code.");
      }
    } catch (err) {
      setMessage(err.response?.data?.message || "Verification failed.");
    }

    setLoading(false);
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    setResendTimer(30);

    try {
      await resendCode(email);
      setMessage("Code resent successfully!");
    } catch (err) {
      setMessage("Failed to resend code.");
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white rounded shadow-md p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6">Verify Code</h2>

        <form onSubmit={handleVerify}>
          <label className="block mb-1 font-medium">Email</label>
          <input
            className="w-full border rounded px-3 py-2 mb-4"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={codeSent}
          />

          <label className="block mb-1 font-medium">Verification Code</label>
          <input
            className="w-full border rounded px-3 py-2 mb-4"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />

          <button
            disabled={loading}
            className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 transition"
          >
            {loading ? "Verifying..." : "Verify Code"}
          </button>
        </form>

        {/* Resend Button */}
        {codeSent && (
          <div className="mt-4 text-center">
            <button
              onClick={handleResend}
              disabled={resendTimer > 0}
              className={`px-4 py-2 rounded text-white ${
                resendTimer > 0
                  ? "bg-gray-400"
                  : "bg-purple-600 hover:bg-purple-700"
              }`}
            >
              {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend Code"}
            </button>
          </div>
        )}

        {message && <p className="text-center mt-4">{message}</p>}
      </div>
    </div>
  );
}
