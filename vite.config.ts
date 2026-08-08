import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  root: "frontend",
  base: "/audio-studio/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./frontend/src") },
  },
  build: {
    outDir: "../ui-next",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:7860",
      "/audio": "http://127.0.0.1:7860",
      "/icon": "http://127.0.0.1:7860",
      "/download": "http://127.0.0.1:7860",
    },
  },
})
