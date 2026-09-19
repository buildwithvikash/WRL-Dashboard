import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // xfwd: pass the browser's real IP to the backend (X-Forwarded-For) so
      // Settings > User Access shows it instead of the proxy's 127.0.0.1.
      "/api": { target: "http://localhost:3000", xfwd: true },
    },
  },
});
