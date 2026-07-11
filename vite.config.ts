import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/testmails/",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src/client") } },
  build: { outDir: "dist/client", emptyOutDir: true },
  server: { proxy: { "/testmails/api": "http://localhost:3000" } }
});
