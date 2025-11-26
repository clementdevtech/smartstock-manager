import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";

// ⚡ Lazy-loaded pages
const Inventory = lazy(() => import("./pages/Inventory"));
const Sales = lazy(() => import("./pages/Sales"));
const POS = lazy(() => import("./pages/POS"));
const Reports = lazy(() => import("./pages/Reports"));
const Backup = lazy(() => import("./pages/Backup"));
const Settings = lazy(() => import("./pages/Settings"));
const Login = lazy(() => import("./pages/Login")); // ✅ Add login

// 🌀 Shimmer loader
const LoadingScreen = () => (
  <div className="flex items-center justify-center h-[60vh]">
    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
    <p className="ml-3 text-gray-600 dark:text-gray-300 font-medium">
      Loading...
    </p>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100">
        {/* 🌐 Navbar */}
        <Navbar />

        {/* 🧭 Page Routes */}
        <main className="flex-grow p-4 md:p-6 lg:p-8">
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path="/" element={<Navigate to="/inventory" replace />} />

              {/* 🔐 Protected Pages */}
              <Route
                path="/inventory"
                element={
                  <ProtectedRoute>
                    <Inventory />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sales"
                element={
                  <ProtectedRoute>
                    <Sales />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pos"
                element={
                  <ProtectedRoute>
                    <POS />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports"
                element={
                  <ProtectedRoute>
                    <Reports />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/backup"
                element={
                  <ProtectedRoute>
                    <Backup />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                }
              />

              {/* 🔑 Public Pages */}
              <Route path="/login" element={<Login />} />

              {/* ⚠️ 404 */}
              <Route
                path="*"
                element={
                  <div className="text-center py-20">
                    <h2 className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                      404 — Page Not Found
                    </h2>
                    <p className="text-gray-500 dark:text-gray-400 mt-2">
                      The page you’re looking for doesn’t exist.
                    </p>
                  </div>
                }
              />
            </Routes>
          </Suspense>
        </main>

        {/* 🧩 Footer */}
        <Footer />
      </div>
    </AuthProvider>
  );
}

export default App;
