# Prerequisites

Do these in order. A skipped step fails later and looks like a code bug.

## Supabase

1. **Create the Supabase project** — copy the Project URL, anon key and service_role key (Project Settings → API).
2. **Run `sql scripts/migration.sql`** — existing databases only; skip on a new project.
3. **Run `sql scripts/script.sql`** — always; the full schema, safe to re-run.
4. **Enable `pg_cron` and `pg_net`** (Database → Extensions) — only if `script.sql` errors on them.
5. **Turn on the auth hook** (Authentication → Hooks → Customize access token → `public.custom_access_token_hook`) — without it the app shows no data.
6. **Set refresh token reuse interval to `30`** (Authentication → Sessions) — stops collectors being logged out.
7. **Add function secrets `SERVICE_ROLE_KEY`, `ANON_KEY`, `PORTAL_JWT_SECRET`** (Edge Functions → Secrets) — names must match exactly; never change `PORTAL_JWT_SECRET` later.
8. **Run `npm run deploy-all-functions`** in `SubsTrack/` — deploys 10 edge functions; redeploy after any change, including `_shared/`.
9. **Deploy `customer-status` too** — `supabase functions deploy customer-status` in `SubsTrack/`. It is not in `deploy-all-functions`; the Web app's customer list needs it.

## Apps

10. **Create `SubsTrack/.env`** — `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Local runs only.
11. **Add the same two values in EAS** (expo.dev → project → Environment variables → `production`, and `preview` if you use it) — app builds and OTA updates read these, never `.env`. Missing → the app crashes at start.
12. **Set up SuperAdminWeb** (your owner page) — create `SuperAdminWeb/.env` with `VITE_SUPABASE_URL` only, never a key. Put it on Vercel (see `production-setup.md`). When the page opens, you paste the service role key; it stays only in that browser.
13. **Create `Portal/.env`** — `VITE_PORTAL_FUNCTION_URL` (`<project url>/functions/v1/customer-portal`), `VITE_SUPABASE_ANON_KEY`; on Vercel set them in Environment Variables.
14. **Build the portal** (`cd Portal && npm install --ignore-scripts && npm run build`) — publish `dist/` to its own subdomain.
15. **Publish the Website** (`Website/`) — first replace `[COMPANY LEGAL NAME]` and `[ADDRESS]` in `privacy/` and `terms/`, and set the 3 variables from `Website/.env.example` (in `Website/.env` locally, in Vercel for the live site): support WhatsApp number (same as `SupportWhatsAppNumber`), support email, site URL (same as `WebsiteUrl`).
16. **Review SuperAdminWeb → Options**:
    - `LiraRate`
    - `SupportWhatsAppNumber` — powers "Get help" and "Contact us" on the login screen.
    - `CustomerPortalUrl` — no `/` at the end.
    - `WebsiteUrl` — no `/` at the end. Powers Privacy, Terms and Delete account links.
    - `AppDownloadUrl` — Play Store page or APK link for old phones.
    - `MinClientVersion` — leave blank until you need to force an update.
17. **Create organizations in SuperAdminWeb** — the app has no sign-up screen any more. Reset a forgotten owner password in SuperAdminWeb → tenant details → Owner login.
18. **Run the app** (`npm install`, then `npx expo run:android`) — needs a dev client; Expo Go does not work.
19. **Run the tests** (`cd tests && npm install --ignore-scripts && npm test`) — checks the money rules.

## WhatsApp (optional)

Full steps: [docs/whatsapp-setup-guide.md](docs/whatsapp-setup-guide.md).

20. **Set up the Meta app** — Business Verification (takes days), WhatsApp use case, Embedded Signup configuration, allowed web domain.
21. **Add function secrets `META_APP_ID`, `META_APP_SECRET`, `WHATSAPP_TOKEN_KEY`, `WHATSAPP_WORKER_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`** — make new random values for each project; keep them in a password manager, never in this repository. Keep a safe copy of `WHATSAPP_TOKEN_KEY`.
22. **Add Vault secrets `whatsapp_worker_url`, `whatsapp_worker_secret`, `whatsapp_worker_apikey`** (Integrations → Vault) — if one is missing, messages stay "Waiting".
23. **Set the Meta webhook to `<project url>/functions/v1/whatsapp-webhook?apikey=<anon key>`** — the `?apikey=` is required.
24. **Deploy the SubsTrack web build** — it hosts the `/whatsapp-connect` page.
25. **Fill `WhatsAppAppId`, `WhatsAppConfigId`, `WhatsAppConnectUrl`** in SuperAdminWeb → Options — blank means tenants cannot connect.
26. **Turn on "WhatsApp messaging allowed"** per tenant (SuperAdminWeb → Tenants → edit) — nothing shows until it is on.
27. **Pass Meta App Review and switch the app to Live** — until then only your own test accounts can connect.

## Launch check

- [ ] Create an organization in SuperAdminWeb — the owner can log in.
- [ ] Open a customer — rows appear (empty = auth hook off).
- [ ] Create a staff user — `create-user` works.
- [ ] Collect a payment — the month turns paid.
- [ ] Open a customer's portal link — the portal opens, same month grid as the app.
- [ ] Login screen shows "Get help", "Contact us", Terms and Privacy.
- [ ] More → Delete my account opens the Website deletion page.
- [ ] (WhatsApp) Send a reminder to your own phone — Admin → WhatsApp messages shows Delivered.
