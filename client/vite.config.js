import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration for SmartStock Manager Pro
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000', // Proxy backend API
    },
  },
  build: {
    outDir: 'dist',
  },
});
