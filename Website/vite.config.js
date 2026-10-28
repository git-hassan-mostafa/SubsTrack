import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: "./",
  publicDir: "public",
  server: {
    port: 3000,
    open: false,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
        privacy: fileURLToPath(new URL("privacy/index.html", import.meta.url)),
        terms: fileURLToPath(new URL("terms/index.html", import.meta.url)),
        deleteAccount: fileURLToPath(new URL("delete-account/index.html", import.meta.url)),
      },
    },
  },
});
