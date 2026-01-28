import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  // ✅ Load env properly
  const env = loadEnv(mode, process.cwd(), "");

  const API_BASE = env.VITE_API_URL || "http://localhost:3333";

  return {
    base: "./", // REQUIRED for Electron

    plugins: [react()],

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },

    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: API_BASE,
          changeOrigin: true,
        },
      },
    },

    build: {
      outDir: "dist",
    },
  };
});
