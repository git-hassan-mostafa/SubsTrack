# Build, Test & Release

Moved out of CLAUDE.md: running the apps, the `tests/` package, and OTA/EAS
releases. See also `docs/ota-fingerprint-mismatch.md` for the CRLF trap.

## Running the Apps

Both apps share the same Supabase backend. Each has its own `.env` file with Supabase credentials.

```bash
# SubsTrack (main app)
cd SubsTrack
yarn install
yarn start          # Expo dev server (scan QR with Expo Go)
yarn android        # Android emulator
yarn ios            # iOS simulator
yarn deploy-create-user-edge-function    # Deploy Supabase Edge Function
yarn deploy-create-tenant-edge-function  # Deploy self-service tenant signup function (public, --no-verify-jwt)

# SuperAdmin
cd SuperAdmin
yarn install
yarn start
```

> **SubsTrack now requires a custom development build (dev client) — not Expo Go.** Since `react-native-keyboard-controller` (a native module) was added for keyboard handling, the app redboxes in Expo Go. For local dev use `npx expo run:android` / `npx expo run:ios` (or add `expo-dev-client` and build once); for distributables use the EAS profiles (`npm run build-preview` / `build-prod`). After pulling, run `npm install` first — the project actually uses `package-lock.json` (the `yarn` labels above are legacy; commands map 1:1 to `npm`).

**Environment variables** (create `.env` in each app folder):

```
EXPO_PUBLIC_SUPABASE_URL=<your-supabase-url>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

### Tests (`tests/`)

```bash
cd tests
npm install --ignore-scripts   # --ignore-scripts is required on the dev laptop
npm test                       # ~3s; `npm test -- suites/waterfall.test.ts` for one
npm run typecheck              # tsc over the suites + the app types they assert against
```

Jest + Babel over the **money** code: the waterfall, `buildMonthGrid`, the customer badge, the pay/void order rules, `ChargeService` / `CollectionService` / `LedgerService` / `SaleService`, custody, and end-to-end money-conservation invariants. Services run for real against an in-memory ledger (`helpers/fakeLedger.ts`) that follows the two repositories' documented contract; native modules are one-file stubs in `stubs/`. **A stub may fake a platform, never a rule.** The folder carries its **own `tsconfig.json`** — there is none at the repo root, so without it the IDE cannot resolve a single `@/…` import; it aliases `@/*` to `../SubsTrack/*` and includes `nativewind-env.d.ts`, because tsc (unlike Jest) follows the real barrels and one of them re-exports a screen.

**It is a separate npm package on purpose, and must never move into `SubsTrack/`** — that `package.json`'s scripts and dependency tree feed the OTA fingerprint, so a devDependency there silently cuts every installed app off from updates (gotcha #53). It is Jest rather than Vitest for a second reason: this laptop's AV blocks spawning vendored tool binaries, so esbuild cannot run; Babel is pure JS. If `npm test` says *Access is denied*, call `node node_modules/jest/bin/jest.js`.

Case numbering, the invariants and the do-not-delete regression list are in [QA/money-unit-tests.md](QA/money-unit-tests.md). Everything else — screens, the Supabase query layer, the SQLite mirror, RLS — is still verified manually via the running app against `QA/`.

### Releasing SubsTrack — OTA updates (EAS Update)

SubsTrack ships JS over the air. Default to an OTA publish; build only when something **native** changed.

```bash
npm run ota-prod                        # publish JS to the production channel (prompts for a message)
npm run ota-prod -- -m "fix debt tile"  # …or pass the message
npm run ota-preview                     # same, to the preview channel
npm run ota-fingerprint                 # print the local runtime fingerprint
npm run build-preview / build-prod      # full rebuild — only when the table below says so
```

| Ships over the air ✅                                                                 | Needs a rebuild + reinstall ❌                                     |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| anything in `src/` and `app/`, locale JSON, Tailwind styles, bundled `assets/`        | a new or upgraded **native** library or config plugin              |
| additive columns in the SQLite mirror `tables.ts` (`applySchema.ts` `ALTER`s them in) | Expo SDK / React Native upgrade                                    |
| new Supabase queries and edge-function call sites                                     | app icon, splash, permissions, `android.package`, `newArchEnabled` |

Postgres changes are server-side and unrelated — but run `script.sql` **before** publishing an update that reads a new column. Non-additive local-schema changes are still not reconciled on either side.

`runtimeVersion` is `{ policy: "fingerprint" }`: Expo derives the compatibility label itself and only matching builds receive an update, so a forgotten rebuild means "no update arrives", never a crash. **This is also the main trap** — `package.json` → `scripts` feeds the fingerprint, and so do the raw bytes of `eas.json` + `.gitignore`, which is why the repo root carries a `.gitattributes` (`* text=auto eol=lf`): EAS builds on Linux, so a CRLF checkout on Windows fingerprints differently and every OTA publish silently misses the installed build. Read gotchas #53 / #53b before changing scripts or native deps, or if an update never arrives. Channels live on the `eas.json` build profiles (`development` / `preview` / `production`); a build with no channel can never receive an update. Rollback with `eas update:rollback`, promote preview → production with `eas update:republish`.

In-app, `useAppUpdate` + `<UpdateBanner>` (mounted once in `app/(app)/_layout.tsx`) download in the background, re-check on every foreground, and show a "New version ready → Restart" pill. Both no-op on web and in dev builds.

---

