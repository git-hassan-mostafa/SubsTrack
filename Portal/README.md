# Customer Portal

Read-only page a customer opens for themselves. Staff copy the link from the customer form in SubsTrack; customer types the password staff set there, sees own months, bills, payments, purchases. **Writes nothing.**

```
{app_options.CustomerPortalUrl}/{customers.id}
```

Link carries no secret of its own — v4 uuid is already 122 bits → no code column, nothing to rotate. Password gates it; switching **Customer portal** off in the app revokes a leaked link.

## Why a separate package

`SubsTrack/package.json` (`scripts` + dependency tree) feeds EAS OTA runtime fingerprint; a dependency/script added there stops every installed phone receiving updates (gotcha #53). Same reason `tests/` is its own package. **Nothing for the portal may be added to `SubsTrack/package.json`**, incl. the edge-function deploy script → `deploy-function` lives here.

## Reimplements no rule

Main screen is computed, not stored: months are never rows; `monthStatus.buildMonthGrid()` (`Shared/src/modules/customer/customer-payments/utils/monthStatus.ts`) = single source of truth for their status. Portal imports staff app's logic from `Shared/` via `@shared/*`, never copies: `buildMonthGrid`, `buildCustomerStatus`, `mergeOwed`, `resolveLinePrice`, `priceHistoryOf` / `linePriceAt` (each month at its own price, `customer-portal` returns `lineChanges` / `planChanges` / `leftPlans`, gotcha #185), the waterfall, every `Db* → domain` mapper, money formatters. A figure disagreeing w/ staff app = a rule restated somewhere instead of imported.

**No stubs**: Shared never imports React Native, Expo or app code (`tests/suites/sharedBoundary.test.ts` enforces), and the pure files portal reaches never read Shared's runtime → portal calls no `configureShared()`. **Import deep paths** — Shared has no barrels; each import names the defining file; `npm run typecheck` catches a wrong one. Only other alias `@edge/*`, for zero-import WhatsApp files under `SubsTrack/supabase/functions/_shared/`.

`src/core/i18n/setup.ts` inits Shared's i18next instance w/ Shared's **own** locale files → month names + bill labels read identically to the app, not a second copy.

## Running it

```bash
npm install --ignore-scripts   # --ignore-scripts is required on the dev laptop
cp .env.example .env           # point VITE_PORTAL_FUNCTION_URL at the function
npm run dev
npm run typecheck
npm run build                  # typecheck + bundle to dist/
```

Open `http://localhost:5173/<a real customer id>`.

## Deploying

```bash
npm run deploy-function        # supabase functions deploy customer-portal --no-verify-jwt
npm run build                  # then publish dist/ (vercel.json carries the SPA rewrite)
```

Function needs `PORTAL_JWT_SECRET` set once (`supabase secrets set`). `app_options.CustomerPortalUrl` must point where `dist/` is published — app builds the link from it, so a domain change needs no rebuild, no OTA publish.

Edge function does **not** ship OTA: deploy it before the app update relying on it.

## Layers

```
screens/components  ->  state/portalStore  ->  services/PortalReadModel  ->  repository/PortalRepository
```

`PortalRepository` holds the only `fetch` in the app. No `@supabase/supabase-js` dependency: one `fetch` to one function is the whole client.

It sends the project **anon key** b/c Supabase function gateway answers `401 UNAUTHORIZED_NO_AUTH_HEADER` to a call w/o API key **even when function is `verify_jwt = false`** — `verify_jwt` decides whether token claims are checked, not whether a key must be present. Preflight exempt → `OPTIONS` still reaches function unauthenticated.

That key = same public one staff app ships; alone it reaches exactly one table: `app_options` (global config — only policy granted `TO anon`). No customer/tenant row reachable → portal's boundary is still the edge function alone.

Unit tests for shared money seam: `tests/suites/portalReadModel.test.ts`.
