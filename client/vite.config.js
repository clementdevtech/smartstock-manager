import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const API_BASE = env.VITE_API_URL || "http://localhost:3333";

  return {
    /* 🔥 CRITICAL FIX FOR ELECTRON */
    base: "./",

    plugins: [react()],

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },

    optimizeDeps: {},

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

      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ["react", "react-dom"],
          },
        },
      },

      chunkSizeWarningLimit: 1000,
    },
  };
});