import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const base = process.env.VITE_BASE_PATH ?? (mode === "production" ? "./" : "/");

  return {
    base,
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 5173,
    },
    preview: {
      host: "127.0.0.1",
      port: 4173,
    },
  };
});
