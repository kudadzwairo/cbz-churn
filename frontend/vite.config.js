import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = process.env.CBZ_API_PORT || "8000";
const uiPort = Number(process.env.CBZ_UI_PORT || 5173);

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: uiPort,
    strictPort: true,
    proxy: {
      "/api": `http://127.0.0.1:${apiPort}`,
    },
  },
});
