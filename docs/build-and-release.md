# Build, Test & Release

Running the apps, `tests/`, OTA/EAS releases. CRLF trap: `docs/ota-fingerprint-mismatch.md`.

## Running the Apps

Both apps share one Supabase backend; each has its own `.env`.

```bash
# SubsTrack (main app)
cd SubsTrack
yarn install
yarn start          # Expo dev server (scan QR with Expo Go)
yarn android        # Android emulator
yarn ios            # iOS simulator
yarn deploy-create-user-edge-function    # Deploy Supabase Edge Function
yarn deploy-create-tenant-edge-function  # self-service tenant signup function (public, --no-verify-jwt)
yarn deploy-whatsapp-functions           # the five whatsapp-* functions (docs/whatsapp.md)

# SuperAdmin
cd SuperAdmin
yarn install
yarn start
```

**SubsTrack needs a dev client — NOT Expo Go** (redboxes: native `react-native-keyboard-controller`). Local dev: `npx expo run:android` / `npx expo run:ios` (or add `expo-dev-client`, build once); distributables: EAS profiles `npm run build-preview` / `build-prod`. After pulling run `npm install` first — project uses `package-lock.json`; `yarn` labels above are legacy, map 1:1 to `npm`.

**Env vars** (`.env` in each app folder):

```
EXPO_PUBLIC_SUPABASE_URL=<your-supabase-url>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

### Web (`Web/`)

Staff desktop web app (React + Vite 8 + React Router + MUI v9 + MUI X). Own package like Portal — never add anything to `SubsTrack/package.json` for it (#53).

```bash
cd Shared && npm install --ignore-scripts   # once: tsc resolves Shared's own imports from here
cd Web
npm install --ignore-scripts
cp .env.example .env.local                  # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev                                 # http://localhost:5173
npm run build                               # tsc -b + vite build
npm run lint                                # oxlint; on this laptop "Access is denied" → node node_modules/oxlint/bin/oxlint
```

- Startup (`src/main.tsx`): `configureWeb()` (Supabase client on `localStorage`, WebCrypto ids, `createSupabaseRepositories()` — no offline layer) → English i18n init → `auth.restoreSession()` → render.
- Aliases: `@/` → `Web/src/`, `@shared/`, `@edge/` (as Portal). `resolve.dedupe` = Shared's `peerDependencies` → bundle holds ONE copy of each library, all from `Web/node_modules`.
- `tsconfig.app.json` also maps `@supabase/supabase-js` to Web's copy: Shared's editor copy is pinned to phone's older version, so its `SupabaseClient` class type wouldn't match the web client passed to `configureShared()`. Add same mapping for any other peer whose types clash.
- Pages + access: one list `src/app/routes/appPages.ts` (path, title, access, icon, nav section), access = Shared `PAGE_ACCESS` (`Shared/src/modules/authentication/auth/utils/pageAccess.ts`, `canOpen`/`canOpenPage`/`landingPage`; phone admin menu, tabs, route redirects, landing read it too); web `access.ts` only maps landing → path; fed by Shared `useAuth()`. Left nav (`app/layout/SideNav.tsx`) + header title (`usePageTitle`, from each route's `handle.titleKey`) both read it → new page = one entry there.
- Shell (`app/layout/AppFrame.tsx`): permanent left nav from `md` up, drawer below; header = page title, quick-action icons (`QuickActions.tsx` over Shared `quickActionItems` — a row shows only once its handler is given, so add it in the phase whose dialog/page works; its dialog goes in `QuickActionDialogs.tsx`, keyed by Shared `uiStore`), `BranchSelector` (same hide rules as phone), `UserMenu` (profile, My Wallet, Log Out w/ confirm).
- Dialogs: `ConfirmDialogHost` mounted once in `App.tsx`, answers every Shared `confirm()`. `FormDialog` (`shared/components/`) = the one form popup: X / Cancel / Esc go through Shared `useUnsavedChangesGuard` when `dirty` (feed it `useDirtyForm`); backdrop click never closes; Enter submits; Save spins while `onSubmit`'s promise runs; `error` shows in `ErrorBanner` at top.
- Lists: every web list = `DataTable` (`shared/table/`, free MUI Data Grid: server paging up to 100 rows/page, no column sorting) fed by a `createPagedStore()` store (`src/state/`), whose `(query, window)` reader calls a Shared service method reading `I*Repository.findPage(query) → { rows, total }`. **Both** repository classes implement `findPage` (rule 5b). `BranchesPage` (`modules/admin/branches/`) = reference page, copy its shape. Rules: `docs/ui-patterns.md` → Web tables.
- Log out = `endWebSession()` (`src/state/webSession.ts`): Shared `endSession()`, then every web-only store under `src/state/` (each new one adds its reset to `WEB_STORE_RESETS`). Never call `endSession()` directly from a web page.
- Edge bundle: `npm run build-edge` writes the Shared code `customer-status` runs into `SubsTrack/supabase/functions/customer-status/_generated/` (committed — rebuild + commit after a month-rule change); `npm run deploy-customer-status` builds + deploys; plain `supabase functions deploy customer-status` uses the committed bundle. Details + no-CLI route: docs/edge-functions.md → `customer-status`.
- Deploy: `Web/vercel.json` (installs Web + Shared dev deps, SPA rewrite). Vercel **preview** project until switch-over phase (H2); real address stays on Expo web until then.

### Tests (`tests/`)

```bash
cd tests
npm install --ignore-scripts   # --ignore-scripts is required on the dev laptop
npm test                       # ~3s; `npm test -- suites/waterfall.test.ts` for one
npm run typecheck              # tsc over the suites + the app types they assert against
```

Jest + Babel over **money** code: waterfall, `buildMonthGrid`, customer badge, pay/void order rules, `ChargeService` / `CollectionService` / `LedgerService` / `SaleService`, custody, end-to-end money-conservation invariants. Services run for real against in-memory ledger (`helpers/fakeLedger.ts`) following the two repositories' documented contract; native modules = one-file stubs in `stubs/`. **A stub may fake a platform, never a rule.** Own `tsconfig.json` (none at repo root → IDE can't resolve any import without it); aliases `@shared/*` → `../Shared/src/*`, `@edge/*` → `../SubsTrack/supabase/functions/_shared/*`, `@/*` → `../SubsTrack/*` (offline-layer suites). `helpers/configureRuntime.ts` (Jest `setupFiles` entry) calls `configureShared()` once: phone's own ids adapter over node-crypto stub, memory storage, `helpers/fakeRepositories.ts` (in-memory `charge` / `collection` / `sale` fakes; any other repository key throws). `suites/sharedBoundary.test.ts` = guard keeping `Shared/src` free of React Native, Expo, app imports.

Separate package, never inside `SubsTrack/`: CLAUDE.md §1.3 (#53). Jest not Vitest b/c laptop AV blocks spawning vendored tool binaries (esbuild can't run; Babel is pure JS). _Access is denied_ → `node node_modules/jest/bin/jest.js`.

Case numbering, invariants, do-not-delete regression list: `QA/money-unit-tests.md`. Everything else (screens, Supabase query layer, SQLite mirror, RLS) verified manually via the running app against `QA/`.

### Shared (`Shared/`)

```bash
cd Shared
npm install --ignore-scripts   # types for tsc and the editor only — no app loads Shared/node_modules
npx tsc --noEmit
```

Source only — nothing builds/publishes it. SubsTrack's Metro bundles straight from `../Shared/src` (Shared change ships OTA like any `src/` change); Vite does same for Portal + `Web/`. **Adding a library Shared imports:** list it in `Shared/package.json` `peerDependencies` **and** `devDependencies` (pinned to SubsTrack's version), install it in every app reaching that file. Metro resolves bare imports only from `SubsTrack/node_modules` and blocks `Shared/node_modules`; Vite dedupes the peer list → each app gets ONE copy. Never make `Shared/` an npm workspace — hoisting changes OTA fingerprint (#53). NOT fingerprint inputs: `Shared/package.json` (outside Expo project), `metro.config.js`, `babel.config.js`, `tsconfig.json`.

### Releasing SubsTrack — OTA updates (EAS Update)

Default to OTA publish; build only when something **native** changed.

```bash
npm run ota-prod                        # publish JS to the production channel (prompts for a message)
npm run ota-prod -- -m "fix debt tile"  # …or pass the message
npm run ota-preview                     # same, to the preview channel
npm run ota-fingerprint                 # print the local runtime fingerprint
npm run build-preview / build-prod      # full rebuild — only when the table below says so
```

|Ships OTA ✅|Needs rebuild + reinstall ❌|
|-|-|
|anything in `src/`, `app/`, `../Shared/src/`, locale JSON, Tailwind styles, bundled `assets/`|new/upgraded **native** library or config plugin|
|additive columns in SQLite mirror `tables.ts` (`applySchema.ts` `ALTER`s them in)|Expo SDK / React Native upgrade|
|new Supabase queries + edge-function call sites|app icon, splash, permissions, `android.package`, `newArchEnabled`|

Postgres changes are server-side, unrelated — but run `script.sql` **before** publishing an update that reads a new column. Non-additive local-schema changes still not reconciled on either side.

`runtimeVersion` = `{ policy: "fingerprint" }`: only matching builds receive an update → forgotten rebuild = "no update arrives", never a crash. **Main trap**: `package.json` → `scripts` + raw bytes of `eas.json` / `.gitignore` feed it; repo-root `.gitattributes` (`* text=auto eol=lf`) stops CRLF drift (→ #53b). Read #53 / #53b before changing scripts or native deps, or if an update never arrives. Channels on `eas.json` build profiles (`development` / `preview` / `production`); a build w/ no channel can never receive an update. Rollback `eas update:rollback`; promote preview → production `eas update:republish`.

In-app `useAppUpdate` + `<UpdateBanner>` (mounted once in `app/(app)/_layout.tsx`) download in background, re-check every foreground, show "New version ready → Restart" pill. Both no-op on web + in dev builds.
