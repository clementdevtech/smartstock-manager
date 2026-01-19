import { useContext, useState } from "react";
import { useForm } from "react-hook-form";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthContext } from "../context/AuthContext";
import { login } from "../services/auth";
import { useToast } from "../hooks/use-toast";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "../components/ui/card";

import { Button } from "../components/ui/button";

export default function Login() {
  const { loginUser } = useContext(AuthContext);
  const { toast } = useToast();
  const { register, handleSubmit } = useForm();

  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);

  const onSubmit = async (data) => {
    setLoading(true);

    try {
      const res = await login(data.email, data.password);

      // --- LOGIN SUCCESS ---
      loginUser(res.user);

      toast({
        title: "Welcome back!",
        description: `Logged in as ${res.user.email}`,
      });

      if (!remember) {
        localStorage.removeItem("token");
      }

      if (res.user.role === "admin") {
         window.location.href = "/dashboard";
        } else {
          window.location.href = "/pos";
        }


    } catch (err) {
      console.error("Login error:", err);

      // Extract backend error message
      const backendMessage =
        err?.response?.data?.message ||
        err?.message ||
        "Login failed";

      toast({
        title: "Login failed",
        description: backendMessage,
        variant: "destructive",
      });
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4 transition-colors duration-300">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="shadow-xl rounded-2xl border border-border bg-card text-card-foreground">
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
                  className="peer w-full px-3 py-4 bg-input border border-border rounded-xl outline-none text-foreground focus:ring-2 focus:ring-emerald-500"
                />
                <label className="absolute left-3 top-3 text-muted-foreground transition-all
                  peer-focus:-top-6 peer-focus:text-sm peer-focus:text-emerald-600
                  peer-valid:-top-6 peer-valid:text-sm">
                  Email Address
                </label>
              </div>

              {/* Password */}
              <div className="relative">
                <input
                  {...register("password")}
                  type={showPass ? "text" : "password"}
                  required
                  className="peer w-full px-3 py-4 bg-input border border-border rounded-xl outline-none text-foreground focus:ring-2 focus:ring-emerald-500"
                />
                <label className="absolute left-3 top-3 text-muted-foreground transition-all
                  peer-focus:-top-6 peer-focus:text-sm peer-focus:text-emerald-600
                  peer-valid:-top-6 peer-valid:text-sm">
                  Password
                </label>

                {/* Toggle Password */}
                <div
                  className="absolute right-3 top-3 text-muted-foreground cursor-pointer"
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
                  <span className="text-muted-foreground">Remember me</span>
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
                {loading && <Loader2 className="animate-spin mr-2" size={18} />}
                {loading ? "Logging in..." : "Login"}
              </Button>

              <p className="text-sm text-center text-muted-foreground">
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
