import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    assetsDir: ".",
    emptyOutDir: false,
    rollupOptions: {
      input: {
        controller: resolve(__dirname, "controller.html"),
        stage: resolve(__dirname, "stage.html")
      }
    }
  }
});
