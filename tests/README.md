# tests/ — money unit tests

Jest + Babel. **Own** npm package on purpose: `SubsTrack/package.json` (`scripts` + dependency tree) feeds the OTA fingerprint, so a devDependency or `"test"` script there silently cuts every installed app off from OTA updates until a new native build ships (gotcha #53). App imports nothing from here.

```bash
cd tests
npm install --ignore-scripts     # --ignore-scripts is required on the dev laptop
npm test                         # every suite
npm test -- suites/waterfall.test.ts
npm run test:watch
npm run test:coverage
npm run typecheck                # tsc over the tests AND the app code they reach
```

`npm test` → **Access is denied** = AV script control blocking the `.cmd` shim → run `node node_modules/jest/bin/jest.js`. (Same block is why Jest + Babel, not Vitest: esbuild's binary can't be spawned.)

## Layout

|Path|What|
|-|-|
|`suites/*.test.ts`|one file per area; every case numbered `TC-XX-nn`, cross-referenced from `QA/money-unit-tests.md`|
|`suites/sharedBoundary.test.ts`|guard for `Shared/src`: fails when a Shared file imports `react-native`, `expo-*`, `@react-native*` or app code (`@/…`, or a relative path leaving `Shared/src`), or when an `@edge/*` file it reaches has an import of its own|
|`helpers/factories.ts`|builders for domain shapes; every default = boring case: USD, one month, nothing voided, nothing collected|
|`helpers/fakeLedger.ts`|in-memory `charges` / `collections` / `collection_items` store following the SAME rules the two real repositories document. Implements no money rule — no waterfall, no month status, no validation|
|`helpers/fakeSales.ts`|same for `sales` / `sale_items` / stock movements|
|`helpers/fakeSqlite.ts`|in-memory stand-in for the ONE SQLite connection, parsing only statement shapes `db/dml.ts` + sync engine emit. Enforces PRIMARY KEY + natural-key UNIQUE index, no money rule|
|`helpers/fakeSupabase.ts`|RECORDING PostgREST stand-in, only for the four sync suites (must see the engine's requests). Every other suite keeps `stubs/supabase-client.ts`, which throws on any access|
|`helpers/clock.ts`|freezes "today". A month test not pinning the clock passes in June, fails in July|
|`tsconfig.json`|read by editor + `npm run typecheck`. No tsconfig at repo root → without it every `@/…` import and `describe`/`expect` errors in IDE|
|`stubs/`|one tiny file per native module the app graph reaches (expo-crypto, Supabase client, NetInfo, i18n; no `react-native` stub — only the deleted platform check reached it). A stub may fake a **platform**, never a rule|

Jest vs tsc see the app differently on purpose: `moduleNameMapper` swaps native modules for stubs, **tsc follows the real files** → tests checked against the app's real types.

## Adding a test

Put it in the suite owning the rule, next `TC-XX-nn` number, name it after the rule not the function. A bug-reproducing test goes in section 4 of `QA/money-unit-tests.md` so it's never deleted as redundant.

New native import in app → add a stub here + a `moduleNameMapper` line in `jest.config.js`. Never change app code to suit the test.
