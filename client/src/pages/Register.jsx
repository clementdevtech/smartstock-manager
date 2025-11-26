// Register.jsx
import { useState, useRef, useEffect, useContext } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, Check, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { AuthContext } from "@/contexts/AuthContext";
import {
  sendVerificationEmail,
  verifyEmailCode,
  validateProductKey,
  assignProductKeyToEmail,
  uploadLogo,
  register as registerApi,
  checkEmailExists,
  validateInviteCode,
} from "@/services/authService";

// Small helper: format product key as XXXX-XXXX-XXXX-XXXX
const formatProductKey = (value) => {
  const cleaned = (value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const blocks = cleaned.match(/.{1,4}/g);
  return blocks ? blocks.join("-").substring(0, 19) : "";
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
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm({ mode: "onChange" });

  // Multi-step
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // fields managed separately for some instant UI needs
  const [productKey, setProductKey] = useState("");
  const [productKeyStatus, setProductKeyStatus] = useState(null); // null | 'valid' | 'invalid' | 'checking'
  const [emailExists, setEmailExists] = useState(null); // null|true|false
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({ label: "empty", score: 0 });
  const [inviteValid, setInviteValid] = useState(null); // null | true | false
  const [phoneCountry, setPhoneCountry] = useState({ code: "+1", iso: "US" });
  const [captchaToken, setCaptchaToken] = useState(null); // placeholder for recaptcha

  // watch password for strength & checklist
  const password = watch("password", "");
  useEffect(() => {
    setPasswordStrength(evaluateStrength(password));
  }, [password]);

  // PRODUCT KEY HANDLING
  const onProductKeyChange = async (e) => {
    const formatted = formatProductKey(e.target.value);
    setProductKey(formatted);
    setValue("productKey", formatted);
    setProductKeyStatus("checking");

    // quick client-side length check
    if (!formatted || formatted.replace(/-/g, "").length < 16) {
      setProductKeyStatus(null);
      return;
    }

    try {
      const res = await validateProductKey(formatted.replace(/-/g, ""));
      setProductKeyStatus(res.valid ? "valid" : "invalid");
    } catch (err) {
      setProductKeyStatus("invalid");
    }
  };

  // EMAIL EXISTENCE CHECK (debounced)
  const emailRef = useRef();
  useEffect(() => {
    const id = setTimeout(async () => {
      const email = getValues("email");
      if (!email || !email.includes("@")) {
        setEmailExists(null);
        return;
      }
      try {
        const exists = await checkEmailExists(email);
        setEmailExists(exists.exists);
      } catch {
        setEmailExists(null);
      }
    }, 650);
    return () => clearTimeout(id);
  }, [watch("email")]);

  // INVITE CODE CHECK (if user typed)
  const onInviteChange = async (e) => {
    const v = e.target.value.trim();
    setValue("inviteCode", v);
    if (!v) return setInviteValid(null);
    try {
      const ok = await validateInviteCode(v);
      setInviteValid(ok.valid);
    } catch {
      setInviteValid(false);
    }
  };

  // LOGO UPLOAD PREVIEW
  const handleLogoChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setLogoFile(f);
    const url = URL.createObjectURL(f);
    setLogoPreview(url);
  };

  // SEND EMAIL VERIFICATION CODE
  const handleSendVerification = async () => {
    const email = getValues("email");
    if (!email || !email.includes("@")) {
      alert("Enter a valid email first.");
      return;
    }
    setVerificationLoading(true);
    try {
      await sendVerificationEmail(email);
      setVerificationSent(true);
      setVerificationSuccess(false);
      alert("Verification code sent to your email. Check inbox/spam.");
    } catch (err) {
      alert(err.message || "Failed to send verification.");
    } finally {
      setVerificationLoading(false);
    }
  };

  // VERIFY CODE entered by user
  const handleVerifyCode = async (code) => {
    setVerificationLoading(true);
    try {
      const email = getValues("email");
      const res = await verifyEmailCode(email, code);
      if (res.verified) {
        setVerificationSuccess(true);
        // ON VERIFIED: assign product key automatically to this email (backend saves it)
        if (productKey && productKeyStatus === "valid") {
          try {
            await assignProductKeyToEmail({
              email,
              productKey: productKey.replace(/-/g, ""),
            });
            // product key assigned successfully — advance to next step automatically
            setStep(3); // security step
          } catch (err) {
            alert("Failed to assign product key: " + (err.message || ""));
          }
        } else {
          // if key missing, step to next, backend will assign on final register
          setStep(3);
        }
      } else {
        alert("Code invalid.");
      }
    } catch (err) {
      alert(err.message || "Verification failed.");
    } finally {
      setVerificationLoading(false);
    }
  };

  // FINAL SUBMIT
  const onSubmit = async (payload) => {
    setLoading(true);

    try {
      // Upload logo if any
      let logoUrl = null;
      if (logoFile) {
        const upl = await uploadLogo(logoFile);
        logoUrl = upl.url;
      }

      // prepare final payload
      const finalPayload = {
        storeName: payload.storeName,
        productKey: productKey ? productKey.replace(/-/g, "") : undefined,
        email: payload.email,
        password: payload.password,
        phone: payload.phone,
        country: payload.country,
        logoUrl,
        inviteCode: payload.inviteCode || undefined,
        captcha: captchaToken || undefined,
      };

      // call register endpoint
      const res = await registerApi(finalPayload);

      // log user in via context
      loginUser(res.user);

      // show assigned key (if returned)
      const assignedKey = res.productKey || productKey.replace(/-/g, "");

      // redirect or show success
      alert("Registration successful!");
      window.location.href = "/dashboard";
    } catch (err) {
      alert(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  // small UI helpers
  const pwRequirements = [
    { label: "8+ characters", ok: (pw) => pw && pw.length >= 8 },
    { label: "Uppercase letter", ok: (pw) => /[A-Z]/.test(pw) },
    { label: "Number", ok: (pw) => /[0-9]/.test(pw) },
    { label: "Symbol", ok: (pw) => /[^A-Za-z0-9]/.test(pw) },
  ];

  // Step components
  const Step1 = () => (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Store Info</h3>

      <label className="block">
        <span className="text-sm font-medium">Store Name</span>
        <input
          {...register("storeName", { required: true })}
          className="w-full mt-1 p-3 border rounded-lg"
          placeholder="My Supermart Ltd"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Upload Store Logo (optional)</span>
        <input type="file" accept="image/*" onChange={handleLogoChange} className="mt-2" />
        {logoPreview && (
          <img src={logoPreview} alt="logo preview" className="h-24 mt-3 object-contain rounded" />
        )}
      </label>

      <label className="block">
        <span className="text-sm font-medium">Product Key</span>
        <input
          name="productKey"
          value={productKey}
          onChange={onProductKeyChange}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          maxLength={19}
          className="w-full mt-1 p-3 border rounded-lg uppercase tracking-widest"
        />
        <div className="mt-2 flex items-center gap-2 text-sm">
          {productKeyStatus === "checking" && <span>Checking key...</span>}
          {productKeyStatus === "valid" && (
            <span className="flex items-center text-green-600 gap-1"><Check size={16}/> Valid key</span>
          )}
          {productKeyStatus === "invalid" && (
            <span className="flex items-center text-red-600 gap-1"><X size={16}/> Invalid key</span>
          )}
          {!productKeyStatus && <span className="text-gray-500">Enter your 16 character product key</span>}
        </div>
      </label>

      <label className="block">
        <span className="text-sm font-medium">Invite Code (optional)</span>
        <input onChange={onInviteChange} className="w-full mt-1 p-3 border rounded-lg" placeholder="INVITE123" />
        {inviteValid === true && <div className="text-green-600 text-sm mt-1">Invite valid</div>}
        {inviteValid === false && <div className="text-red-600 text-sm mt-1">Invite invalid</div>}
      </label>

      <div className="flex justify-end gap-3 mt-2">
        <button
          onClick={() => setStep(2)}
          className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
        >
          Next: Verify Email
        </button>
      </div>
    </div>
  );

  const Step2 = () => (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Verify Email</h3>

      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input
          {...register("email", { required: true })}
          className="w-full mt-1 p-3 border rounded-lg"
          placeholder="owner@store.com"
        />
        {emailExists === true && <div className="text-yellow-600 text-sm mt-1">Email already registered</div>}
      </label>

      <div className="flex gap-2 items-center">
        <button
          onClick={handleSendVerification}
          disabled={verificationLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          {verificationLoading ? "Sending..." : "Send verification code"}
        </button>

        {verificationSent && (
          <div className="text-sm text-gray-700">Code sent — check your inbox (or spam)</div>
        )}
      </div>

      <label className="block">
        <span className="text-sm font-medium">Enter verification code</span>
        <input id="code" type="text" className="w-full mt-1 p-3 border rounded-lg" />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => {
              const code = document.getElementById("code").value.trim();
              if (!code) return alert("Enter code");
              handleVerifyCode(code);
            }}
            className="px-4 py-2 bg-emerald-600 text-white rounded"
            disabled={verificationLoading}
          >
            {verificationLoading ? "Verifying..." : "Verify"}
          </button>
          {verificationSuccess && <div className="text-green-600">Verified ✓</div>}
        </div>
      </label>

      <div className="flex justify-between mt-3">
        <button onClick={() => setStep(1)} className="px-4 py-2 border rounded">Back</button>
        <button
          onClick={() => {
            if (!verificationSuccess) return alert("You must verify email first.");
            setStep(3);
          }}
          className="px-4 py-2 bg-emerald-600 text-white rounded"
        >
          Next: Security
        </button>
      </div>
    </div>
  );

  const Step3 = () => (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Security & Contact</h3>

      <label className="block">
        <span className="text-sm font-medium">Password</span>
        <div className="relative">
          <input
            {...register("password", { required: true })}
            type={passwordVisible ? "text" : "password"}
            className="w-full mt-1 p-3 border rounded-lg"
            placeholder="Choose a strong password"
          />
          <button
            type="button"
            onClick={() => setPasswordVisible((s) => !s)}
            className="absolute right-3 top-3"
          >
            {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </label>

      <label className="block">
        <span className="text-sm font-medium">Confirm Password</span>
        <div className="relative">
          <input
            {...register("confirmPassword", { required: true })}
            type={confirmVisible ? "text" : "password"}
            className="w-full mt-1 p-3 border rounded-lg"
            placeholder="Confirm password"
          />
          <button type="button" onClick={() => setConfirmVisible((s) => !s)} className="absolute right-3 top-3">
            {confirmVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </label>

      {/* Password requirements checklist */}
      <div className="p-3 border rounded-md bg-gray-50">
        <div className="text-sm font-medium mb-2">Password Requirements</div>
        <ul className="space-y-1">
          {pwRequirements.map((r) => {
            const ok = r.ok(password);
            return (
              <li key={r.label} className={`flex items-center gap-2 text-sm ${ok ? "text-green-600" : "text-gray-600"}`}>
                {ok ? <Check size={14} /> : <span style={{ width: 14 }} />}
                {r.label}
              </li>
            );
          })}
        </ul>

        {/* strength bar */}
        <div className="mt-3">
          <div className="h-2 bg-gray-200 rounded overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{
                width: passwordStrength.label === "empty" ? "0%" : passwordStrength.label === "weak" ? "33%" : passwordStrength.label === "medium" ? "66%" : "100%",
              }}
              className={`h-full ${passwordStrength.label === "weak" ? "bg-red-500" : passwordStrength.label === "medium" ? "bg-yellow-500" : "bg-green-500"}`}
            />
          </div>
          <div className="text-xs mt-1">
            Strength: <strong>{passwordStrength.label}</strong>
          </div>
        </div>
      </div>

      <label className="block">
        <span className="text-sm font-medium">Phone</span>
        <div className="flex gap-2">
          <select {...register("country")} className="p-3 border rounded-lg w-32">
            <option value="US">US (+1)</option>
            <option value="GB">UK (+44)</option>
            <option value="KE">KE (+254)</option>
            {/* extend with country list as needed */}
          </select>
          <input {...register("phone")} className="flex-1 p-3 border rounded-lg" placeholder="Phone number" />
        </div>
      </label>

      {/* Placeholder for reCAPTCHA: implement with your site key */}
      <div className="mt-2">
        <div className="text-sm text-gray-600">reCAPTCHA placeholder (implement site key)</div>
      </div>

      <div className="flex justify-between mt-4">
        <button onClick={() => setStep(2)} className="px-4 py-2 border rounded">Back</button>
        <button
          onClick={() => {
            const vals = getValues();
            if (!vals.password || !vals.confirmPassword) return alert("Fill passwords");
            if (vals.password !== vals.confirmPassword) return alert("Passwords do not match");
            setStep(4);
          }}
          className="px-4 py-2 bg-emerald-600 text-white rounded"
        >
          Next: Finish
        </button>
      </div>
    </div>
  );

  const Step4 = () => {
    const assignedKey = productKey ? productKey : "Will be assigned";
    return (
      <div className="space-y-4">
        <h3 className="text-xl font-semibold">Finish & Create Account</h3>

        <div className="p-4 border rounded space-y-2">
          <div><strong>Store:</strong> {getValues("storeName")}</div>
          <div><strong>Email:</strong> {getValues("email")}</div>
          <div><strong>Assigned Product Key:</strong> <span className="font-mono">{assignedKey}</span></div>
          <div><strong>Invite code:</strong> {getValues("inviteCode") || "—"}</div>
        </div>

        <div className="flex justify-between mt-4">
          <button onClick={() => setStep(3)} className="px-4 py-2 border rounded">Back</button>
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-emerald-100 p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-3xl">
        <div className="bg-white rounded-2xl shadow-lg p-6 grid md:grid-cols-2 gap-6">
          <div className="hidden md:block p-4">
            <h2 className="text-3xl font-extrabold text-emerald-700 mb-3">Create your SmartStock account</h2>
            <p className="text-gray-600">Step {step} of 4 — onboarding made simple. Your product key will be assigned once we verify your email.</p>

            <ol className="mt-6 space-y-3 text-sm">
              <li className={`${step === 1 ? "text-emerald-600 font-semibold" : ""}`}>1. Store Info</li>
              <li className={`${step === 2 ? "text-emerald-600 font-semibold" : ""}`}>2. Verify Email</li>
              <li className={`${step === 3 ? "text-emerald-600 font-semibold" : ""}`}>3. Security</li>
              <li className={`${step === 4 ? "text-emerald-600 font-semibold" : ""}`}>4. Finish</li>
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
