import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = process.env.API_PORT || "8787";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    hmr: process.env.DISABLE_HMR !== "true",
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
      "/ws": {
        target: `ws://127.0.0.1:${apiPort}`,
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
  },
});
