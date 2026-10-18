import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const target = loadEnv(mode, ".", "VITE_").VITE_DEV_PROXY_TARGET?.trim();
  return {
    plugins: [react()],
    preview: { host: "127.0.0.1", proxy: {} },
    server: {
      host: "127.0.0.1",
      port: 5174,
      proxy: target ? {
        "/api": { target, changeOrigin: true },
        "/health": { target, changeOrigin: true },
        "/ws": { target, changeOrigin: true, ws: true },
      } : undefined,
    },
  };
});
