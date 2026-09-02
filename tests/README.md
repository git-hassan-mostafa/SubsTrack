# tests/ — money unit tests

Jest + Babel. Its **own** npm package on purpose: `SubsTrack/package.json` (its `scripts` and its dependency tree) feeds the OTA fingerprint, so adding a devDependency or a `"test"` script there would silently cut every installed app off from OTA updates until a new native build shipped — gotcha #53. Nothing here is imported by the app.

```bash
cd tests
npm install --ignore-scripts     # --ignore-scripts is required on the dev laptop
npm test                         # every suite
npm test -- suites/waterfall.test.ts
npm run test:watch
npm run test:coverage
npm run typecheck                # tsc over the tests AND the app code they reach
```

If `npm test` reports **Access is denied**, the machine's AV script control is blocking the `.cmd` shim — run `node node_modules/jest/bin/jest.js` instead. (The same block is why this is Jest + Babel and not Vitest: esbuild's binary cannot be spawned here.)

## Layout

| Path | What it is |
|---|---|
| `suites/*.test.ts` | One file per area. Every case is numbered `TC-XX-nn` and cross-referenced from [QA/money-unit-tests.md](../QA/money-unit-tests.md) |
| `helpers/factories.ts` | Builders for the domain shapes. Every default is the boring case: USD, one month, nothing voided, nothing collected |
| `helpers/fakeLedger.ts` | An in-memory `charges` / `collections` / `collection_items` store following the SAME rules the two real repositories document. It implements no money rule — no waterfall, no month status, no validation |
| `helpers/fakeSales.ts` | The same for `sales` / `sale_items` / stock movements |
| `helpers/clock.ts` | Freezes "today". A month test that does not pin the clock passes in June and fails in July |
| `tsconfig.json` | The editor and `npm run typecheck` read this. There is no tsconfig at the repo root, so without it every `@/…` import and every `describe`/`expect` is an error in the IDE |
| `stubs/` | One tiny file per native module the app graph reaches (react-native, expo-crypto, the Supabase client, NetInfo…). A stub may fake a **platform**, never a rule |

Jest and tsc see the app differently on purpose: `moduleNameMapper` swaps the native modules for stubs, while **tsc follows the real files** so the tests are checked against the app's real types. That is also why `tsconfig.json` pulls in `../SubsTrack/nativewind-env.d.ts` — a barrel two hops down the money graph re-exports a screen, and without NativeWind's `className` augmentation every one of those `.tsx` files reports errors that do not exist.

## Adding a test

Put it in the suite that owns the rule, give it the next `TC-XX-nn` number, and name it after the rule rather than the function. A test that reproduces a bug goes in section 4 of [QA/money-unit-tests.md](../QA/money-unit-tests.md) so it is never deleted as redundant.

New native import in the app → add a stub here and a `moduleNameMapper` line in `jest.config.js`. Never work around it by changing app code to suit the test.
