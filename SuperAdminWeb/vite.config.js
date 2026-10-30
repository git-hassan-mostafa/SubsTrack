import { existsSync, readFileSync, rmSync } from "node:fs";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const toPosix = (p) => p.replaceAll("\\", "/");

const SHARED_SRC = toPosix(here("../Shared/src/"));
const BUILT_PAGE = here("dist/index.html");
const KEY_LIKE = [/eyJ[\w-]{10,}\.eyJ[\w-]{10,}/, /sb_secret_[\w-]{10,}/];

// A key in .env would be baked into the built file, so the build refuses it.
function assertEnv(env) {
  const url = env.VITE_SUPABASE_URL;
  if (!url) {
    throw new Error("SuperAdminWeb: set VITE_SUPABASE_URL in SuperAdminWeb/.env (copy .env.example).");
  }
  if (!url.startsWith("https://") || url.endsWith("/")) {
    throw new Error("SuperAdminWeb: VITE_SUPABASE_URL must start with https:// and must not end with a slash.");
  }
  const keyed = Object.keys(env).filter((name) => KEY_LIKE.some((pattern) => pattern.test(env[name])));
  if (keyed.length > 0) {
    throw new Error(`SuperAdminWeb: remove ${keyed.join(", ")} from .env. The service role key is pasted in the page, never stored in a file.`);
  }
}

// A bare package import from Shared would bundle Shared's dev copy unnoticed.
function pureSharedOnly() {
  return {
    name: "superadmin-web:pure-shared-only",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer || !toPosix(importer).startsWith(SHARED_SRC)) return null;
      if (source.startsWith(".") || source.startsWith("\0") || isAbsolute(source)) return null;
      if (source.startsWith("@shared/")) return null;
      this.error(`SuperAdminWeb: ${importer} imports "${source}". Only Shared files with no package imports may be used here.`);
    },
  };
}

// Last line of defence: a built page holding a key is deleted.
function noKeyInBuild() {
  return {
    name: "superadmin-web:no-key-in-build",
    apply: "build",
    closeBundle() {
      if (!existsSync(BUILT_PAGE)) return;
      const html = readFileSync(BUILT_PAGE, "utf8");
      if (KEY_LIKE.some((pattern) => pattern.test(html))) {
        rmSync(BUILT_PAGE);
        throw new Error("SuperAdminWeb: the built page contains a Supabase key. It was deleted.");
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  assertEnv(loadEnv(mode, here(".")));
  return {
    root: "./",
    publicDir: false,
    plugins: [pureSharedOnly(), viteSingleFile(), noKeyInBuild()],
    resolve: {
      alias: [{ find: /^@shared\//, replacement: here("../Shared/src/") }],
    },
    server: {
      port: 3100,
      open: false,
      fs: { allow: [here("."), here("../Shared")] },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
