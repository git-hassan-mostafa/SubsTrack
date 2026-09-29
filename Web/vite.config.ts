import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const sharedPeers = Object.keys(
  JSON.parse(readFileSync(here("../Shared/package.json"), "utf8"))
    .peerDependencies,
);

// Mirrors tsconfig.app.json paths; dedupe keeps ONE copy of each Shared peer.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\//, replacement: here("./src/") },
      { find: /^@shared\//, replacement: here("../Shared/src/") },
      {
        find: /^@edge\//,
        replacement: here("../SubsTrack/supabase/functions/_shared/"),
      },
    ],
    dedupe: sharedPeers,
  },
  server: {
    fs: {
      allow: [
        here("."),
        here("../Shared"),
        here("../SubsTrack/supabase/functions/_shared"),
      ],
    },
  },
});
