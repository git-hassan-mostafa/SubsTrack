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
8. **Run `npm run deploy-all-functions`** in `SubsTrack/` — deploys all 10 edge functions; redeploy after any change, including `_shared/`.

## Apps

9. **Create `SubsTrack/.env`** — `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
10. **Create `SuperAdmin/.env`** — same two plus `EXPO_PUBLIC_SUPABASE_SERVICE_KEY`; never install it on a customer's device.
11. **Create `Portal/.env`** — `VITE_PORTAL_FUNCTION_URL` (`<project url>/functions/v1/customer-portal`), `VITE_SUPABASE_ANON_KEY`; on Vercel set them in Environment Variables.
12. **Build the portal** (`cd Portal && npm install --ignore-scripts && npm run build`) — publish `dist/` to its own subdomain.
13. **Review SuperAdmin → Options** — `LiraRate`, `AllowSelfServiceSignup`, `SupportWhatsAppNumber`, `CustomerPortalUrl` (no trailing slash).
14. **Run the app** (`npm install`, then `npx expo run:android`) — needs a dev client; Expo Go does not work.
15. **Run the tests** (`cd tests && npm install --ignore-scripts && npm test`) — checks the money rules.

## WhatsApp (optional)

Full steps: [docs/whatsapp-setup-guide.md](docs/whatsapp-setup-guide.md).

16. **Set up the Meta app** — Business Verification (takes days), WhatsApp use case, Embedded Signup configuration, allowed web domain.
17. **Add function secrets `META_APP_ID`, `META_APP_SECRET`, `WHATSAPP_TOKEN_KEY`, `WHATSAPP_WORKER_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`** — keep a safe copy of `WHATSAPP_TOKEN_KEY`.
18. **Add Vault secrets `whatsapp_worker_url`, `whatsapp_worker_secret`, `whatsapp_worker_apikey`** (Integrations → Vault) — if one is missing, messages stay "Waiting".
19. **Set the Meta webhook to `<project url>/functions/v1/whatsapp-webhook?apikey=<anon key>`** — the `?apikey=` is required.
20. **Deploy the SubsTrack web build** — it hosts the `/whatsapp-connect` page.
21. **Fill `WhatsAppAppId`, `WhatsAppConfigId`, `WhatsAppConnectUrl`** in SuperAdmin → Options — blank means tenants cannot connect.
22. **Turn on "WhatsApp messaging allowed"** per tenant (SuperAdmin → Tenants → edit) — nothing shows until it is on.
23. **Pass Meta App Review and switch the app to Live** — until then only your own test accounts can connect.

## Launch check

- [ ] Sign up a new organization — `create-tenant` works.
- [ ] Open a customer — rows appear (empty = auth hook off).
- [ ] Create a staff user — `create-user` works.
- [ ] Collect a payment — the month turns paid.
- [ ] Open a customer's portal link — the portal opens, same month grid as the app.
- [ ] (WhatsApp) Send a reminder to your own phone — Admin → WhatsApp messages shows Delivered.
