import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: {
    outDir: "site-dist",
    rollupOptions: { input: { index: "index.html", lab: "lab.html" } },
  },
});
