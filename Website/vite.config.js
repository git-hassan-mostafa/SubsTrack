import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const REQUIRED_ENV = ["VITE_SUPPORT_WHATSAPP_NUMBER", "VITE_SUPPORT_EMAIL", "VITE_SITE_URL"];
const PACKAGE_PRICE_ENV = ["VITE_PACKAGE_300_USD", "VITE_PACKAGE_500_USD", "VITE_PACKAGE_1000_USD"];

// HTML %VITE_X% is left as raw text when a variable is missing, so stop the build instead.
function assertSiteEnv(env) {
  const missing = REQUIRED_ENV.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Website: set ${missing.join(", ")} in Website/.env (copy .env.example) or in the host's environment variables.`);
  }
  if (!/^\d+$/.test(env.VITE_SUPPORT_WHATSAPP_NUMBER)) {
    throw new Error("Website: VITE_SUPPORT_WHATSAPP_NUMBER must be digits only with the country code: no +, spaces or dashes (e.g. 96170123456).");
  }
  if (env.VITE_SITE_URL.endsWith("/")) {
    throw new Error("Website: VITE_SITE_URL must not end with a slash.");
  }
  const badPrices = PACKAGE_PRICE_ENV.filter((key) => env[key] && !(Number(env[key]) > 0));
  if (badPrices.length > 0) {
    throw new Error(`Website: ${badPrices.join(", ")} must be a number of US dollars, like 30 or 29.99 (or left empty).`);
  }
}

export default defineConfig(({ mode }) => {
  assertSiteEnv(loadEnv(mode, fileURLToPath(new URL(".", import.meta.url))));
  return {
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
  };
});
