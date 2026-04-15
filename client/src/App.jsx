import React, { Suspense, lazy, useContext } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import AdminRoute from "./components/AdminRoute";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider, AuthContext } from "./context/AuthContext";
import { ToastProvider } from "@/components/ui/toast";
import { Toaster } from "./components/ui/toaster";
import { BusinessProvider } from "./context/BusinessContext";

/* ⚡ Lazy-loaded pages */
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Sales = lazy(() => import("./pages/Sales"));
const POS = lazy(() => import("./pages/POS"));
const Reports = lazy(() => import("./pages/Reports"));
const Backup = lazy(() => import("./pages/Backup"));
const Settings = lazy(() => import("./pages/Settings"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));

/* 🔓 Password reset pages */
const ForgotPassword = lazy(() => import("./pages/forgot-password"));
const VerifyResetCode = lazy(() => import("./pages/verify"));
const ResetPassword = lazy(() => import("./pages/change-password"));

/* 🌀 Loading screen */
const LoadingScreen = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
    <p className="ml-3 text-gray-600 dark:text-gray-300 font-medium">
      Loading...
    </p>
  </div>
);

function AppContent() {
  const { user, loading } = useContext(AuthContext);
  const location = useLocation();

  const currentPath = location.pathname;

  /* 🧱 Hide layout on auth-related pages */
  const authPages = [
    "/login",
    "/register",
    "/forgot-password",
    "/verify-reset-code",
  ];

  const hideLayout = authPages.some((path) =>
    currentPath.startsWith(path)
  );

  /* ⛔ WAIT until auth state is resolved */
  if (loading) return <LoadingScreen />;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100">
      {!hideLayout && <Navbar />}

      <main className="flex-grow p-4 md:p-6 lg:p-8">
        <Suspense fallback={<LoadingScreen />}>
          <Routes>

            {/* 🔁 ROOT ROUTE */}
            <Route
              path="/"
              element={
                !user
                  ? <Navigate to="/register" replace />
                  : user.role === "admin"
                  ? <Navigate to="/dashboard" replace />
                  : <Navigate to="/login" replace />
              }
            />

            {/* 🧾 POS — All authenticated users */}
            <Route
              path="/pos"
              element={
                <ProtectedRoute>
                  <POS />
                </ProtectedRoute>
              }
            />

            {/* 🧑‍💼 ADMIN DASHBOARD */}
            <Route
              path="/dashboard"
              element={
                <AdminRoute>
                  <Dashboard />
                </AdminRoute>
              }
            />

            {/* 🔐 ADMIN-ONLY PAGES */}
            <Route
              path="/inventory"
              element={
                <AdminRoute>
                  <Inventory />
                </AdminRoute>
              }
            />

            <Route
              path="/sales"
              element={
                <AdminRoute>
                  <Sales />
                </AdminRoute>
              }
            />

            <Route
              path="/reports"
              element={
                <AdminRoute>
                  <Reports />
                </AdminRoute>
              }
            />

            <Route
              path="/backup"
              element={
                <AdminRoute>
                  <Backup />
                </AdminRoute>
              }
            />

            <Route
              path="/settings"
              element={
                <AdminRoute>
                  <Settings />
                </AdminRoute>
              }
            />

            {/* 🔓 PUBLIC AUTH */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* 🔑 PASSWORD RESET */}
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/verify-reset-code" element={<VerifyResetCode />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />

            {/* ✅ FINAL FALLBACK (CRITICAL FIX) */}
            <Route
              path="*"
              element={
                !user
                  ? <Navigate to="/register" replace />
                  : user.role === "admin"
                  ? <Navigate to="/dashboard" replace />
                  : <Navigate to="/login" replace />
              }
            />

          </Routes>
        </Suspense>
      </main>

      {!hideLayout && <Footer />}
    </div>
  );
}

/* 🔐 AuthProvider wrapped ONCE */
export default function App() {
  return (
    <AuthProvider>
      <BusinessProvider>
        <ToastProvider>
          <AppContent />
          <Toaster />
        </ToastProvider>
      </BusinessProvider>
    </AuthProvider>
  );
}