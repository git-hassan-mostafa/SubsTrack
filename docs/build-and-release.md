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
yarn deploy-whatsapp-functions           # Deploy the five whatsapp-* functions (see docs/whatsapp.md)

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

### Web (`Web/`)

The staff web app for desktop (React + Vite 8 + React Router + MUI v9 + MUI X). Its own package, like the Portal — never add anything to `SubsTrack/package.json` for it (gotcha #53).

```bash
cd Shared && npm install --ignore-scripts   # once: tsc resolves Shared's own imports from here
cd Web
npm install --ignore-scripts
cp .env.example .env.local                  # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev                                 # http://localhost:5173
npm run build                               # tsc -b + vite build
npm run lint                                # oxlint; on this laptop "Access is denied" → node node_modules/oxlint/bin/oxlint
```

- Startup (`src/main.tsx`): `configureWeb()` (Supabase client on `localStorage`, WebCrypto ids, `createSupabaseRepositories()` — no offline layer), then the English i18n init, then `auth.restoreSession()`, then render.
- Aliases: `@/` → `Web/src/`, `@shared/`, `@edge/` (same as the Portal). `resolve.dedupe` = Shared's `peerDependencies`, so the bundle holds ONE copy of each library, all from `Web/node_modules`.
- `tsconfig.app.json` also maps `@supabase/supabase-js` to Web's copy: Shared's editor copy is pinned to the phone's older version, and its `SupabaseClient` class type would not match the web client passed to `configureShared()`. Add the same mapping for any other peer whose types start to clash.
- Pages and who may open them: one list, `src/app/routes/appPages.ts` (path, title, access, icon, nav section), checked by `access.ts` (`canOpen`, `landingPath`), fed by Shared `useAuth()`. The left nav (`app/layout/SideNav.tsx`) and the header title (`usePageTitle`, from each route's `handle.titleKey`) both read it, so a new page is one entry there.
- Shell (`app/layout/AppFrame.tsx`): permanent left nav from `md` up, a drawer below it; header = page title, quick-action icons (`QuickActions.tsx` — add an icon only in the phase whose dialog or page works; its dialog goes in `QuickActionDialogs.tsx`, keyed by Shared `uiStore`), `BranchSelector` (same hide rules as the phone), `UserMenu` (profile, My Wallet, Log Out with a confirm).
- Dialogs: `ConfirmDialogHost` is mounted once in `App.tsx` and answers every Shared `confirm()` call. `FormDialog` (`shared/components/`) is the one form popup: X / Cancel / Esc go through Shared `useUnsavedChangesGuard` when `dirty` (feed it `useDirtyForm`), a backdrop click never closes it, Enter submits, Save spins while `onSubmit`'s promise runs, `error` shows in an `ErrorBanner` at the top.
- Lists: every web list is a `DataTable` (`shared/table/`, over the free MUI Data Grid: server paging up to 100 rows a page, no column sorting) fed by a paged store from `createPagedStore()` (`src/state/`), whose fetcher calls a Shared service method that reads `I*Repository.findPage(query) → { rows, total }`. **Both** repository classes implement `findPage` (rule 5b). `BranchesPage` (`modules/admin/branches/`) is the reference page — copy its shape. Rules: [docs/ui-patterns.md](docs/ui-patterns.md) → Web tables.
- Log out = `endWebSession()` (`src/state/webSession.ts`): Shared `endSession()`, then every web-only store under `src/state/` (each new one adds its reset to `WEB_STORE_RESETS`). Never call `endSession()` directly from a web page.
- Edge bundle: `npm run build-edge` writes the Shared code the `customer-status` function runs into `SubsTrack/supabase/functions/customer-status/_generated/` (git-ignored); `npm run deploy-customer-status` builds it and deploys the function. Details and the no-CLI route: docs/edge-functions.md → `customer-status`.
- Deploy: `Web/vercel.json` (installs Web + Shared dev deps, SPA rewrite). Use a Vercel **preview** project until the switch-over phase (H2); the real address stays on Expo web until then.

### Tests (`tests/`)

```bash
cd tests
npm install --ignore-scripts   # --ignore-scripts is required on the dev laptop
npm test                       # ~3s; `npm test -- suites/waterfall.test.ts` for one
npm run typecheck              # tsc over the suites + the app types they assert against
```

Jest + Babel over the **money** code: the waterfall, `buildMonthGrid`, the customer badge, the pay/void order rules, `ChargeService` / `CollectionService` / `LedgerService` / `SaleService`, custody, and end-to-end money-conservation invariants. Services run for real against an in-memory ledger (`helpers/fakeLedger.ts`) that follows the two repositories' documented contract; native modules are one-file stubs in `stubs/`. **A stub may fake a platform, never a rule.** The folder carries its **own `tsconfig.json`** — there is none at the repo root, so without it the IDE cannot resolve a single import; it aliases `@shared/*` to `../Shared/src/*`, `@edge/*` to `../SubsTrack/supabase/functions/_shared/*` and `@/*` to `../SubsTrack/*` (the offline-layer suites). `helpers/configureRuntime.ts` (a Jest `setupFiles` entry) calls `configureShared()` once: the phone's own ids adapter over the node-crypto stub, memory storage, and `helpers/fakeRepositories.ts` (the in-memory `charge` / `collection` / `sale` fakes; any other repository key throws). `suites/sharedBoundary.test.ts` is the guard that keeps `Shared/src` free of React Native, Expo and app imports.

**It is a separate npm package on purpose, and must never move into `SubsTrack/`** — that `package.json`'s scripts and dependency tree feed the OTA fingerprint, so a devDependency there silently cuts every installed app off from updates (gotcha #53). It is Jest rather than Vitest for a second reason: this laptop's AV blocks spawning vendored tool binaries, so esbuild cannot run; Babel is pure JS. If `npm test` says _Access is denied_, call `node node_modules/jest/bin/jest.js`.

Case numbering, the invariants and the do-not-delete regression list are in [QA/money-unit-tests.md](QA/money-unit-tests.md). Everything else — screens, the Supabase query layer, the SQLite mirror, RLS — is still verified manually via the running app against `QA/`.

### Shared (`Shared/`)

```bash
cd Shared
npm install --ignore-scripts   # types for tsc and the editor only — no app loads Shared/node_modules
npx tsc --noEmit
```

Source only — nothing builds or publishes it. SubsTrack's Metro bundles its files straight from `../Shared/src` (so a Shared change ships over the air like any `src/` change), and Vite does the same for the Portal and `Web/`. **Adding a library Shared imports:** list it in `Shared/package.json` `peerDependencies` **and** `devDependencies` (pinned to SubsTrack's version), and install it in every app that reaches that file. Metro resolves bare imports only from `SubsTrack/node_modules` and blocks `Shared/node_modules`; Vite dedupes the peer list; either way each app gets ONE copy. Never turn `Shared/` into an npm workspace — hoisting would change the OTA fingerprint (gotcha #53). `Shared/package.json` is **not** a fingerprint input (it sits outside the Expo project), and neither are `metro.config.js`, `babel.config.js` or `tsconfig.json`.

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
| anything in `src/`, `app/` and `../Shared/src/`, locale JSON, Tailwind styles, bundled `assets/` | a new or upgraded **native** library or config plugin              |
| additive columns in the SQLite mirror `tables.ts` (`applySchema.ts` `ALTER`s them in) | Expo SDK / React Native upgrade                                    |
| new Supabase queries and edge-function call sites                                     | app icon, splash, permissions, `android.package`, `newArchEnabled` |

Postgres changes are server-side and unrelated — but run `script.sql` **before** publishing an update that reads a new column. Non-additive local-schema changes are still not reconciled on either side.

`runtimeVersion` is `{ policy: "fingerprint" }`: Expo derives the compatibility label itself and only matching builds receive an update, so a forgotten rebuild means "no update arrives", never a crash. **This is also the main trap** — `package.json` → `scripts` feeds the fingerprint, and so do the raw bytes of `eas.json` + `.gitignore`, which is why the repo root carries a `.gitattributes` (`* text=auto eol=lf`): EAS builds on Linux, so a CRLF checkout on Windows fingerprints differently and every OTA publish silently misses the installed build. Read gotchas #53 / #53b before changing scripts or native deps, or if an update never arrives. Channels live on the `eas.json` build profiles (`development` / `preview` / `production`); a build with no channel can never receive an update. Rollback with `eas update:rollback`, promote preview → production with `eas update:republish`.

In-app, `useAppUpdate` + `<UpdateBanner>` (mounted once in `app/(app)/_layout.tsx`) download in the background, re-check on every foreground, and show a "New version ready → Restart" pill. Both no-op on web and in dev builds.

---
