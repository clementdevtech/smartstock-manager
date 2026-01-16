import { useState, useEffect, useRef } from "react";
import { sendVerificationEmail, resendCode, verifyEmailCode } from "../services/auth";
import { useNavigate } from "react-router-dom";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [resendTimer, setResendTimer] = useState(30);
  const navigate = useNavigate();

  useEffect(() => {
    if (!codeSent || resendTimer === 0) return;
    const interval = setInterval(() => setResendTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [codeSent, resendTimer]);

  const handleSendCode = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      await sendVerificationEmail(email);
      setMessage("Verification code sent!");
      setCodeSent(true);
      setResendTimer(30);
    } catch (err) {
      setMessage(err.response?.data?.message || "Error sending code.");
    }
    setLoading(false);
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    setResendTimer(30);
    try {
      await resendCode(email);
      setMessage("Code resent successfully!");
    } catch {
      setMessage("Failed to resend code.");
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white rounded shadow-md p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6">Forgot Password</h2>

        <form onSubmit={handleSendCode}>
          <label className="block mb-1 font-medium">Email</label>
          <input
            type="email"
            className="w-full border rounded px-3 py-2 mb-4"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={codeSent}
          />
          <button
            type="submit"
            disabled={loading || codeSent}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
          >
            {loading ? "Sending..." : "Send Verification Code"}
          </button>
        </form>

        {codeSent && (
          <>
            <div className="mt-4 text-center">
              <button
                onClick={handleResend}
                disabled={resendTimer > 0}
                className={`px-4 py-2 rounded text-white ${
                  resendTimer > 0 ? "bg-gray-400" : "bg-purple-600 hover:bg-purple-700"
                }`}
              >
                {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend Code"}
              </button>
            </div>
            <div className="mt-6 border-t pt-4">
              <VerifyCodePanel email={email} navigate={navigate} />
            </div>
          </>
        )}

        {message && <p className="text-center mt-4">{message}</p>}
      </div>
    </div>
  );
}

function VerifyCodePanel({ email, navigate }) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const codeInputRef = useRef(null);

  useEffect(() => {
    codeInputRef.current?.focus();
  }, []);

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await verifyEmailCode(email, code);
      if (res.verified && res.token) {
        setMessage("Verified! Redirecting...");
        setTimeout(() => navigate(`/reset-password/${res.token}`), 1000);
      } else {
        setMessage("Invalid or expired code.");
      }
    } catch {
      setMessage("Verification failed.");
    }

    setLoading(false);
  };

  return (
    <>
      <h3 className="text-xl font-bold mb-2">Verify Code</h3>
      <form onSubmit={handleVerify}>
        <label className="block font-medium mb-1">Enter Code</label>
        <input
          ref={codeInputRef}
          type="text"
          className="w-full border rounded px-3 py-2 mb-4"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700"
        >
          {loading ? "Checking..." : "Verify Code"}
        </button>
      </form>
      {message && <p className="text-center mt-3">{message}</p>}
    </>
  );
}
