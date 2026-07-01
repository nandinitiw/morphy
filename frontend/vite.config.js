import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:8000";

  return {
    plugins: [react()],
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.js"],
    },
    server: {
      port: 5173,
      proxy: {
        "/ingest": { target: apiTarget, changeOrigin: true },
        "/jobs": { target: apiTarget, changeOrigin: true },
        "/profile": { target: apiTarget, changeOrigin: true },
        "/coach": { target: apiTarget, changeOrigin: true },
        "/health": { target: apiTarget, changeOrigin: true },
        "/openings": { target: apiTarget, changeOrigin: true },
        "/style-gap": { target: apiTarget, changeOrigin: true },
        "/gms": { target: apiTarget, changeOrigin: true },
        "/blunders": { target: apiTarget, changeOrigin: true },
        "/demo": { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
