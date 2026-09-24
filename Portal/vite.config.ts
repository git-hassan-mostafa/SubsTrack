import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The portal runs SubsTrack's OWN money and month-grid code rather than a copy:
// buildMonthGrid, mergeOwed, resolveLinePrice, the waterfall, the mappers and
// the currency formatters are all imported across the `@` alias below. Three
// aliases stub the native edges those files reach (see stubs/), the same seam
// tests/jest.config.js already uses. Order matters - the specific entries must
// win over the generic `@/` prefix.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\/src\/core\/i18n$/, replacement: here("./stubs/i18n.ts") },
      {
        find: /^@\/src\/shared\/lib\/supabase$/,
        replacement: here("./stubs/supabase-client.ts"),
      },
      { find: /^react-native$/, replacement: here("./stubs/react-native.ts") },
      { find: /^@\//, replacement: here("../SubsTrack/") },
    ],
  },
  server: {
    // The app source lives outside this project root.
    fs: { allow: [here("."), here("../SubsTrack")] },
  },
});
