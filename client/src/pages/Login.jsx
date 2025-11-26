import { useContext, useState } from "react";
import { useForm } from "react-hook-form";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthContext } from "@/contexts/AuthContext";
import { login } from "@/services/authService";
import { toast } from "@/components/ui/use-toast";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

import { Button } from "@/components/ui/button";

export default function Login() {
  const { loginUser } = useContext(AuthContext);

  const { register, handleSubmit } = useForm();
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);

  const onSubmit = async (data) => {
    setLoading(true);

    try {
      const res = await login(data.email, data.password);

      loginUser(res.user);

      toast({
        title: "Welcome back",
        description: "Login successful!",
      });

      // If user checks "Remember me", keep token
      if (!remember) {
        localStorage.removeItem("token");
      }

      // Redirect to dashboard or home
      window.location.href = "/dashboard";
    } catch (err) {
      toast({
        title: "Login failed",
        description: err.message || "Invalid email or password",
        variant: "destructive",
      });
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-emerald-100 p-4">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="shadow-xl rounded-2xl border-none">
          <CardHeader>
            <CardTitle className="text-center text-2xl font-semibold">
              SmartStock Login
            </CardTitle>
          </CardHeader>

          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">

              {/* Email */}
              <div className="relative">
                <input
                  {...register("email")}
                  type="email"
                  required
                  className="peer w-full px-3 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <label className="absolute left-3 top-3 text-gray-500 transition-all peer-focus:-top-3 peer-focus:text-sm peer-focus:text-emerald-600 peer-valid:-top-3 peer-valid:text-sm">
                  Email Address
                </label>
              </div>

              {/* Password */}
              <div className="relative">
                <input
                  {...register("password")}
                  type={showPass ? "text" : "password"}
                  required
                  className="peer w-full px-3 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <label className="absolute left-3 top-3 text-gray-500 transition-all peer-focus:-top-3 peer-focus:text-sm peer-focus:text-emerald-600 peer-valid:-top-3 peer-valid:text-sm">
                  Password
                </label>

                {/* Show/Hide Password */}
                <div
                  className="absolute right-3 top-3 text-gray-600 cursor-pointer"
                  onClick={() => setShowPass(!showPass)}
                >
                  {showPass ? <EyeOff size={20} /> : <Eye size={20} />}
                </div>
              </div>

              {/* Remember Me */}
              <div className="flex items-center justify-between mt-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={() => setRemember(!remember)}
                  />
                  <span className="text-gray-600">Remember me</span>
                </label>

                <a href="/forgot-password" className="text-emerald-600 text-sm">
                  Forgot password?
                </a>
              </div>

            </CardContent>

            <CardFooter className="flex flex-col space-y-3">

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                {loading ? (
                  <Loader2 className="animate-spin mr-2" size={18} />
                ) : null}
                {loading ? "Logging in..." : "Login"}
              </Button>

              <p className="text-sm text-center text-gray-600">
                Don’t have an account?{" "}
                <a href="/register" className="text-emerald-700 font-semibold">
                  Create one
                </a>
              </p>

            </CardFooter>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}