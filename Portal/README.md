# Customer Portal

The read-only page a customer opens for themselves. Staff copy the link from the
customer form in SubsTrack; the customer types the password staff set there and
sees their own months, bills, payments and purchases. **It writes nothing.**

```
{app_options.CustomerPortalUrl}/{customers.id}
```

The link carries no secret of its own — a v4 uuid is already 122 bits — so there
is no code column and nothing to rotate. The password is what gates it, and
switching **Customer portal** off in the app is what revokes a link that leaked.

## Why it is a separate package

`SubsTrack/package.json` — its `scripts` and its dependency tree — feeds the EAS
OTA runtime fingerprint. A dependency or script added there stops every installed
phone receiving updates (gotcha #53). `tests/` exists as its own package for the
same reason, and so does this. **Nothing for the portal may be added to
`SubsTrack/package.json`**, including the edge-function deploy script, which is
why `deploy-function` lives here.

## It reimplements no rule

The portal's main screen is computed, not stored: months are never rows, and
`PaymentService.buildMonthGrid()` is the single source of truth for their status.
So the portal imports SubsTrack's own code across a `@/*` alias rather than
copying it — `buildMonthGrid`, `buildCustomerStatus`, `mergeOwed`,
`resolveLinePrice`, the waterfall, every `Db* → domain` mapper, and the money
formatters. A figure that disagrees with the staff app means a rule was restated
somewhere instead of imported.

Three stubs cut the native edges those files reach (`stubs/`), the same seam
`tests/jest.config.js` uses. **Import deep paths, never module barrels** — the
barrels re-export screens and repositories, and one barrel import drags React
Native and Supabase into the bundle. `npm run typecheck` is what catches it.

`stubs/i18n.ts` loads SubsTrack's **own** locale files, so month names and bill
labels read identically to the app instead of being a second copy.

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

The function needs `PORTAL_JWT_SECRET` set once (`supabase secrets set`), and
`app_options.CustomerPortalUrl` must point at wherever `dist/` is published —
that option is what the app uses to build the link, so changing the domain needs
no rebuild and no OTA publish.

An edge function does **not** ship over OTA: deploy it before the app update that
relies on it.

## Layers

```
screens/components  ->  state/portalStore  ->  services/PortalReadModel  ->  repository/PortalRepository
```

`PortalRepository` holds the only `fetch` in the app. There is no
`@supabase/supabase-js` dependency: one `fetch` to one function is the whole
client.

It does send the project **anon key**, because Supabase's function gateway
answers `401 UNAUTHORIZED_NO_AUTH_HEADER` to a call carrying no API key **even
when the function is `verify_jwt = false`** — `verify_jwt` decides whether the
token's claims are checked, not whether a key must be present. The preflight is
exempt, which is why `OPTIONS` still reaches the function unauthenticated.

That key is the same public one the staff app ships, and on its own it reaches
exactly one table: `app_options` (global config — the only policy granted `TO
anon`). No customer or tenant row is reachable with it, so the portal's boundary
is still the edge function alone.

QA scenarios: `QA/customer-portal.md`. Unit tests for the shared money seam:
`tests/suites/portalReadModel.test.ts`.
