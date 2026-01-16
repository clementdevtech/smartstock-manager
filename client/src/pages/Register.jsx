import { useState, useRef, useEffect, useContext } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { AuthContext } from "../context/AuthContext";

import {
  sendVerificationEmail,
  verifyEmailCode,
  validateProductKey,
  assignProductKeyToEmail,
  uploadLogo,
  register as registerApi,
  checkEmailExists,
  validateInviteCode,
} from "../services/auth";

// Format product key into 6-6-6 (matches DB keys like 6Y3ZP3-A87KPM-C3C0DG)
const formatProductKey = (value) => {
  const cleaned = (value || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 18); // ensure at most 18 raw chars

  const parts = [];
  if (cleaned.length > 0) parts.push(cleaned.slice(0, 6));
  if (cleaned.length > 6) parts.push(cleaned.slice(6, 12));
  if (cleaned.length > 12) parts.push(cleaned.slice(12, 18));
  return parts.join("-");
};

// Password strength evaluator
const evaluateStrength = (pw) => {
  let score = 0;
  if (!pw) return { score, label: "empty" };
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  let label = score <= 2 ? "weak" : score <= 4 ? "medium" : "strong";
  return { score, label };
};

export default function Register() {
  const { loginUser } = useContext(AuthContext);
  const { register, handleSubmit, setValue, getValues } = useForm({
    mode: "onChange",
  });

  // Steps & loading
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Product key state
  const [productKey, setProductKey] = useState("");
  const [productKeyStatus, setProductKeyStatus] = useState(null); // null | 'checking' | 'valid' | 'invalid'
  const productKeyRef = useRef(null);

  // Email (controlled) + existence check
  const [emailInput, setEmailInput] = useState("");
  const [emailExists, setEmailExists] = useState(null);

  // Verification & logo
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationSuccess, setVerificationSuccess] = useState(false);

  const [logoPreview, setLogoPreview] = useState(null);
  const [logoFile, setLogoFile] = useState(null);

  // Password & UI toggles
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({
    score: 0,
    label: "empty",
  });

  const [inviteValid, setInviteValid] = useState(null);

  // update initial strength (kept minimal to avoid caret issues)
  useEffect(() => {
    const pw = getValues("password") || "";
    setPasswordStrength(evaluateStrength(pw));
  }, []);

  // --- PRODUCT KEY INPUT HANDLER (preserves caret) ---
  const onProductKeyChange = async (e) => {
    const input = e.target;
    const raw = input.value;
    const oldCursor = input.selectionStart ?? raw.length;

    // Format
    const formatted = formatProductKey(raw);

    // Update local state + react-hook-form value
    setProductKey(formatted);
    setValue("productKey", formatted);

    // After render, restore caret position correctly.
    // We'll calculate how many dashes existed before the old cursor and after formatting.
    requestAnimationFrame(() => {
      try {
        // Count non-alphanum removed before cursor in raw:
        const leftRaw = raw.slice(0, oldCursor);
        const cleanedLeft = leftRaw.replace(/[^A-Za-z0-9]/g, "");
        // New cursor position = cleanedLeft length plus number of dashes inserted before that position
        let newCursor = cleanedLeft.length;
        // Insert dashes positions: after 6 and after 12 raw chars
        if (newCursor > 6) newCursor += 1;
        if (newCursor > 12) newCursor += 1;
        const inputEl = productKeyRef.current;
        if (inputEl && typeof inputEl.setSelectionRange === "function")
          inputEl.setSelectionRange(newCursor, newCursor);
      } catch {
        /* ignore caret restore errors */
      }
    });

    // Validate only when raw cleaned length reaches 18 (complete key)
    const cleaned = formatted.replace(/-/g, "");
    if (cleaned.length < 18) {
      setProductKeyStatus(null);
      return;
    }

    // Validate key (show checking state)
    setProductKeyStatus("checking");
    try {
      // backend normalizes, you can send formatted or cleaned; backend will handle normalization
      const res = await validateProductKey(formatted);
      setProductKeyStatus(res && res.valid ? "valid" : "invalid");
    } catch {
      setProductKeyStatus("invalid");
    }
  };

  // --- EMAIL DEBOUNCE (controlled input) ---
  useEffect(() => {
    const id = setTimeout(async () => {
      if (!emailInput || !emailInput.includes("@")) {
        setEmailExists(null);
        return;
      }
      try {
        const res = await checkEmailExists(emailInput);
        setEmailExists(res.exists);
      } catch {
        setEmailExists(null);
      }
    }, 600);
    return () => clearTimeout(id);
  }, [emailInput]);

  // Invite code check
  const onInviteChange = async (e) => {
    const code = e.target.value.trim();
    setValue("inviteCode", code);
    if (!code) return setInviteValid(null);
    try {
      const res = await validateInviteCode(code);
      setInviteValid(res.valid);
    } catch {
      setInviteValid(false);
    }
  };

  // Logo preview
  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  // Send verification email
  const handleSendVerification = async () => {
    const email = getValues("email") || emailInput;
    if (!email) return alert("Enter your email first.");
    setVerificationLoading(true);
    try {
      await sendVerificationEmail(email);
      setVerificationSent(true);
      setVerificationSuccess(false);
    } catch {
      alert("Failed to send verification email.");
    } finally {
      setVerificationLoading(false);
    }
  };

  // Verify code
  const handleVerifyCode = async (code) => {
    try {
      setVerificationLoading(true);
      const email = getValues("email") || emailInput;
      const res = await verifyEmailCode(email, code);
      if (!res.verified) {
        alert("Invalid verification code.");
        return;
      }

      setVerificationSuccess(true);

      // Assign product key if present
      if (productKeyStatus === "valid" && productKey) {
        try {
          await assignProductKeyToEmail({
            email,
            productKey, // send formatted (backend should normalize)
          });
        } catch {
          // Non-fatal: continue registration flow even if assignment fails
          console.error("Assign key failed");
        }
      }

      setStep(3);
    } catch {
      alert("Verification failed.");
    } finally {
      setVerificationLoading(false);
    }
  };

  // Final submit
  const onSubmit = async (payload) => {
    setLoading(true);
    try {
      // Upload logo if any
      let logoUrl = null;
      if (logoFile) {
        const uploaded = await uploadLogo(logoFile);
        logoUrl = uploaded.url;
      }

      const finalPayload = {
        storeName: payload.storeName,
        email: payload.email || emailInput,
        password: payload.password,
        productKey: productKey ? productKey.replace(/-/g, "") : undefined, // send cleaned
        phone: payload.phone,
        country: payload.country,
        inviteCode: payload.inviteCode || undefined,
        logoUrl,
      };

      const res = await registerApi(finalPayload);

      // login via context and redirect
      loginUser(res.user);
      alert("Registration successful!");
      window.location.href = "/dashboard";
    } catch (err) {
      alert(err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  // Password requirements
  const pwRequirements = [
    { label: "8+ characters", ok: (pw) => pw && pw.length >= 8 },
    { label: "Uppercase letter", ok: (pw) => /[A-Z]/.test(pw) },
    { label: "Number", ok: (pw) => /[0-9]/.test(pw) },
    { label: "Symbol", ok: (pw) => /[^A-Za-z0-9]/.test(pw) },
  ];

  // --- Step components ---
  const Step1 = () => (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
        Store Info
      </h3>

      <label className="block text-gray-700 dark:text-gray-300">
        <span className="text-sm font-medium">Store Name</span>
        <input
          {...register("storeName", { required: true })}
          className="w-full mt-1 p-3 border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700"
          placeholder="My Supermart Ltd"
        />
      </label>

      <label className="block text-gray-700 dark:text-gray-300">
        <span className="text-sm font-medium">Upload Store Logo (optional)</span>
        <input
          type="file"
          accept="image/*"
          onChange={handleLogoChange}
          className="mt-2 text-gray-700 dark:text-gray-300"
        />
        {logoPreview && (
          <img
            src={logoPreview}
            alt="logo preview"
            className="h-24 mt-3 object-contain rounded"
          />
        )}
      </label>

      <label className="block text-gray-700 dark:text-gray-300">
        <span className="text-sm font-medium">Product Key</span>
        <input
          name="productKey"
          ref={productKeyRef}
          value={productKey}
          onChange={onProductKeyChange}
          placeholder="XXXXXX-XXXXXX-XXXXXX"
          maxLength={20} // 18 chars + 2 dashes = 20
          className="w-full mt-1 p-3 border rounded-lg uppercase tracking-widest bg-white dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700"
        />

        <div className="mt-2 flex items-center gap-2 text-sm">
          {productKeyStatus === "checking" && (
            <span className="text-gray-600 dark:text-gray-400">Checking key...</span>
          )}

          {productKeyStatus === "valid" && (
            <span className="flex items-center text-green-600 gap-1">
              <Check size={18} /> Valid key
            </span>
          )}

          {productKeyStatus === "invalid" && (
            <span className="flex items-center text-red-600 gap-1">
              <X size={18} /> Invalid key
            </span>
          )}

          {!productKeyStatus && (
            <span className="text-gray-500 dark:text-gray-400">
              Enter your 18-character product key (6-6-6)
            </span>
          )}
        </div>
      </label>

      <label className="block text-gray-700 dark:text-gray-300">
        <span className="text-sm font-medium">Invite Code (optional)</span>
        <input
          onChange={onInviteChange}
          className="w-full mt-1 p-3 border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700"
          placeholder="INVITE123"
        />

        {inviteValid === true && (
          <div className="text-green-600 text-sm mt-1">Invite valid</div>
        )}

        {inviteValid === false && (
          <div className="text-red-600 text-sm mt-1">Invite invalid</div>
        )}
      </label>

      <div className="flex justify-end mt-4">
        <button
          onClick={() => {
            const storeName = getValues("storeName") || "";
            // Enforce strict rules: store name, product key must be present + valid, invite valid if present
            if (!storeName.trim()) return alert("Store name is required.");

            if (!productKey)
              return alert("Product key is required.");

            if (productKeyStatus !== "valid")
              return alert("Product key is invalid. Please check again.");

            // inviteValid can be null (not provided) or true/false; if false -> block
            if (inviteValid === false) return alert("Invite code is invalid.");

            setStep(2);
          }}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded"
        >
          Next: Verify Email
        </button>
      </div>
    </div>
  );

  const Step2 = () => (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
        Verify Email
      </h3>

      <label className="block text-gray-700 dark:text-gray-300">
        <span className="text-sm font-medium">Email</span>
        <input
          {...register("email")}
          value={emailInput}
          onChange={(e) => {
            setEmailInput(e.target.value);
            setValue("email", e.target.value);
          }}
          className="w-full mt-1 p-3 border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700"
          placeholder="owner@store.com"
        />

        {emailExists === true && (
          <div className="text-yellow-600 text-sm mt-1">Email already registered</div>
        )}
      </label>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSendVerification}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          disabled={verificationLoading}
        >
          {verificationLoading ? "Sending..." : "Send verification code"}
        </button>

        {verificationSent && (
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Code sent — check your inbox
          </div>
        )}
      </div>

      <label className="block text-gray-700 dark:text-gray-300">
        <span className="text-sm font-medium">Enter verification code</span>
        <input
          id="code"
          type="text"
          className="w-full mt-1 p-3 border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700"
        />

        <div className="flex gap-2 mt-2">
          <button
            onClick={() => {
              const code = document.getElementById("code").value.trim();
              if (!code) return alert("Enter your code");
              handleVerifyCode(code);
            }}
            className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
            disabled={verificationLoading}
          >
            {verificationLoading ? "Verifying..." : "Verify"}
          </button>

          {verificationSuccess && <div className="text-green-600">Verified ✓</div>}
        </div>
      </label>

      <div className="flex justify-between mt-4">
        <button
          onClick={() => setStep(1)}
          className="px-4 py-2 border rounded dark:border-gray-700 dark:text-gray-200"
        >
          Back
        </button>

        <button
          onClick={() => {
            const email = (emailInput || "").trim();
            // Strict rules: email format, not registered, verification success
            if (!email || !email.includes("@") || !email.includes("."))
              return alert("Enter a valid email address.");

            if (emailExists === true) return alert("This email is already registered.");

            if (!verificationSuccess) return alert("You must verify your email before continuing.");

            setStep(3);
          }}
          className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
        >
          Next: Security
        </button>
      </div>
    </div>
  );

  const Step3 = () => (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Security & Contact</h3>

      <label className="block text-gray-700 dark:text-gray-300">
        <span className="text-sm font-medium">Password</span>
        <div className="relative">
          <input
            {...register("password")}
            onChange={(e) => {
              setValue("password", e.target.value);
              setPasswordStrength(evaluateStrength(e.target.value));
            }}
            type={passwordVisible ? "text" : "password"}
            className="w-full mt-1 p-3 border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700"
            placeholder="Choose a strong password"
          />
          <button type="button" onClick={() => setPasswordVisible((s) => !s)} className="absolute right-3 top-3">
            {passwordVisible ? <EyeOff size={18} className="text-gray-500 dark:text-gray-300" /> : <Eye size={18} className="text-gray-500 dark:text-gray-300" />}
          </button>
        </div>
      </label>

      <label className="block text-gray-700 dark:text-gray-300">
        <span className="text-sm font-medium">Confirm Password</span>
        <div className="relative">
          <input
            {...register("confirmPassword")}
            onChange={(e) => setValue("confirmPassword", e.target.value)}
            type={confirmVisible ? "text" : "password"}
            className="w-full mt-1 p-3 border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700"
            placeholder="Confirm password"
          />
          <button type="button" onClick={() => setConfirmVisible((s) => !s)} className="absolute right-3 top-3">
            {confirmVisible ? <EyeOff size={18} className="text-gray-500 dark:text-gray-300" /> : <Eye size={18} className="text-gray-500 dark:text-gray-300" />}
          </button>
        </div>
      </label>

      <div className="p-3 border rounded-md bg-gray-50 dark:bg-gray-900 dark:border-gray-700">
        <div className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Password Requirements</div>
        <ul className="space-y-1">
          {pwRequirements.map((req) => {
            const ok = req.ok(getValues("password") || "");
            return (
              <li key={req.label} className={`flex items-center gap-2 text-sm ${ok ? "text-green-600" : "text-gray-600 dark:text-gray-400"}`}>
                {ok ? <Check size={14} /> : <span className="w-4" />}
                {req.label}
              </li>
            );
          })}
        </ul>

        <div className="mt-3">
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{
                width:
                  passwordStrength.label === "empty"
                    ? "0%"
                    : passwordStrength.label === "weak"
                    ? "33%"
                    : passwordStrength.label === "medium"
                    ? "66%"
                    : "100%",
              }}
              className={`h-full ${passwordStrength.label === "weak" ? "bg-red-500" : passwordStrength.label === "medium" ? "bg-yellow-500" : "bg-green-500"}`}
            />
          </div>
          <div className="text-xs mt-1 text-gray-700 dark:text-gray-300">Strength: <strong>{passwordStrength.label}</strong></div>
        </div>
      </div>

      <label className="block text-gray-700 dark:text-gray-300">
        <span className="text-sm font-medium">Phone</span>
        <div className="flex gap-2">
          <select {...register("country")} className="p-3 border rounded-lg w-32 bg-white dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700">
            <option value="US">US (+1)</option>
            <option value="GB">UK (+44)</option>
            <option value="KE">Kenya (+254)</option>
          </select>
          <input {...register("phone")} className="flex-1 p-3 border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700" placeholder="Phone number" />
        </div>
      </label>

      <div className="flex justify-between mt-4">
        <button onClick={() => setStep(2)} className="px-4 py-2 border rounded dark:border-gray-700 dark:text-gray-200">Back</button>

        <button onClick={() => {
            const vals = getValues();
            const password = vals.password;
            const confirmPassword = vals.confirmPassword;
            const phone = vals.phone;

            if (!password || !confirmPassword) return alert("Please enter and confirm your password.");
            if (password !== confirmPassword) return alert("Passwords do not match.");

            // Ensure password meets ALL requirements
            const failedReq = pwRequirements.find(req => !req.ok(password));
            if (failedReq) return alert(`Password too weak — missing: ${failedReq.label}`);

            if (!phone || !String(phone).trim()) return alert("Phone number is required.");

            setStep(4);
          }} className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700">
          Next: Finish
        </button>
      </div>
    </div>
  );

  const Step4 = () => (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Finish & Create Account</h3>

      <div className="p-4 border rounded bg-white dark:bg-gray-900 dark:border-gray-700">
        <div className="text-gray-800 dark:text-gray-200"><strong>Store:</strong> {getValues("storeName")}</div>
        <div className="text-gray-800 dark:text-gray-200"><strong>Email:</strong> {getValues("email") || emailInput}</div>
        <div className="text-gray-800 dark:text-gray-200"><strong>Product Key:</strong> {productKey || "Will be assigned automatically"}</div>
        <div className="text-gray-800 dark:text-gray-200"><strong>Invite Code:</strong> {getValues("inviteCode") || "—"}</div>
      </div>

      <div className="flex justify-between mt-4">
        <button onClick={() => setStep(3)} className="px-4 py-2 border rounded dark:border-gray-700 dark:text-gray-200">Back</button>

        <button onClick={handleSubmit(onSubmit)} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          {loading ? "Creating account..." : "Create account"}
        </button>
      </div>
    </div>
  );

  // --- Render ---
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-4xl">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-6 grid md:grid-cols-2 gap-6 border border-gray-200 dark:border-gray-700">
          
          <div className="hidden md:block p-4">
            <h2 className="text-3xl font-extrabold text-emerald-700 dark:text-emerald-400 mb-3">Create your SmartStock account</h2>
            <p className="text-gray-600 dark:text-gray-300">Step {step} of 4 — onboarding made simple.</p>

            <ol className="mt-6 space-y-3 text-sm">
              <li className={step === 1 ? "text-emerald-500 font-semibold" : "text-gray-600 dark:text-gray-300"}>1. Store Info</li>
              <li className={step === 2 ? "text-emerald-500 font-semibold" : "text-gray-600 dark:text-gray-300"}>2. Verify Email</li>
              <li className={step === 3 ? "text-emerald-500 font-semibold" : "text-gray-600 dark:text-gray-300"}>3. Security</li>
              <li className={step === 4 ? "text-emerald-500 font-semibold" : "text-gray-600 dark:text-gray-300"}>4. Finish</li>
            </ol>
          </div>

          <div className="p-4">
            <form onSubmit={(e) => e.preventDefault()}>
              {step === 1 && <Step1 />}
              {step === 2 && <Step2 />}
              {step === 3 && <Step3 />}
              {step === 4 && <Step4 />}
            </form>
          </div>

        </div>
      </motion.div>
    </div>
  );
}
