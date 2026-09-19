import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: { outDir: "lab-dist", rollupOptions: { input: "lab.html" } },
});
