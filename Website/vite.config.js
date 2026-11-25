import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const REQUIRED_ENV = [
  "VITE_SUPPORT_WHATSAPP_NUMBER",
  "VITE_SUPPORT_EMAIL",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
];
const URL_ENV = ["VITE_SUPABASE_URL"];
const DEV_PORT = 3000;

// Vercel sets the project's live domain (custom one first) on every build; see docs/build-and-release.md
function siteUrl() {
  const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercelDomain ? `https://${vercelDomain}` : `http://localhost:${DEV_PORT}`;
}

function siteUrlPlugin() {
  const url = siteUrl();
  return {
    name: "site-url",
    transformIndexHtml: {
      order: "pre",
      handler: (html) => html.replaceAll("%SITE_URL%", url),
    },
  };
}

// HTML %VITE_X% is left as raw text when a variable is missing, so stop the build instead.
function assertSiteEnv(env) {
  const missing = REQUIRED_ENV.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Website: set ${missing.join(", ")} in Website/.env (copy .env.example) or in the host's environment variables.`);
  }
  if (!/^\d+$/.test(env.VITE_SUPPORT_WHATSAPP_NUMBER)) {
    throw new Error("Website: VITE_SUPPORT_WHATSAPP_NUMBER must be digits only with the country code: no +, spaces or dashes (e.g. 96170123456).");
  }
  const slashed = URL_ENV.filter((key) => env[key].endsWith("/"));
  if (slashed.length > 0) {
    throw new Error(`Website: ${slashed.join(", ")} must not end with a slash.`);
  }
}

export default defineConfig(({ mode }) => {
  assertSiteEnv(loadEnv(mode, fileURLToPath(new URL(".", import.meta.url))));
  return {
    root: "./",
    publicDir: "public",
    plugins: [siteUrlPlugin()],
    server: {
      port: DEV_PORT,
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
