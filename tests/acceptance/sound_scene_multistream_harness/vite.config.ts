import path from "node:path"
import { defineConfig } from "vite"

const root = path.resolve(import.meta.dirname)

export default defineConfig({
  root,
  base: "./",
  publicDir: path.join(root, "public"),
  resolve: {
    alias: [
      { find: "@/lib/api", replacement: path.join(root, "src/api-stub.ts") },
      { find: "@", replacement: path.resolve(root, "../../../frontend/src") },
    ],
  },
  build: {
    outDir: path.join(root, "dist"),
    emptyOutDir: true,
  },
})
