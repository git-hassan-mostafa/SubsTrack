import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const sharedPeers = Object.keys(
  JSON.parse(readFileSync(here("../Shared/package.json"), "utf8"))
    .peerDependencies,
);

// Mirrors tsconfig.app.json paths; the stub entries must precede the prefixes.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@\/src\/shared\/lib\/supabase$/,
        replacement: here("./stubs/supabase-client.ts"),
      },
      { find: /^react-native$/, replacement: here("./stubs/react-native.ts") },
      { find: /^@shared\//, replacement: here("../Shared/src/") },
      {
        find: /^@edge\//,
        replacement: here("../SubsTrack/supabase/functions/_shared/"),
      },
      { find: /^@\//, replacement: here("../SubsTrack/") },
    ],
    dedupe: sharedPeers,
  },
  server: {
    fs: { allow: [here("."), here("../SubsTrack"), here("../Shared")] },
  },
});
