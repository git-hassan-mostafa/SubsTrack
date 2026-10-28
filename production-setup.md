# Production Setup — from zero

Everything needed to run Sijil in production when you start with only this code: no database, no server.

Do the parts in order. Step-by-step detail for the first setup is also in [prerequisites.md](prerequisites.md).

## Still to do by you (the code cannot do these)

1. **Revoke the old secrets.** `prerequisites.md` used to hold the WhatsApp keys and a real Meta access token. They are removed from the file, but git history still has them. Revoke that Meta token in Meta, and make new values for every secret in prod.
2. **Fill the legal pages.** `Website/privacy/`, `Website/terms/` and `Website/delete-account/` have `[...]` placeholders: company legal name, address, support WhatsApp number, support email. Have a lawyer check the text.
3. **Fix the Website "Book a demo" form.** It shows "Request received" but sends nothing, so every request is lost. New businesses can no longer sign up in the app, so this form (or the WhatsApp "Contact us" link) is how they reach you.
4. **The SuperAdmin app holds the master key** (service_role). Anyone with it can read and change every tenant's data. Install it only on your own phone; never share the APK.

## 1. Accounts to create

- [ ] **Supabase — Pro plan ($25/month).** The free plan pauses the project after 7 days with no use and has no backups.
- [ ] **Expo (EAS)** — app builds and OTA updates.
- [ ] **Vercel** — hosts the web sites.
- [ ] **A domain** — e.g. `www.` (website), `app.` (staff web), `portal.` (customer portal).
- [ ] **Google Play Console** ($25 once) — only if you publish on Play. A **personal** account must first run a closed test with 12 testers for 14 days; an **organization** account skips this.
- [ ] **Meta Business** — only for WhatsApp. Business Verification takes days, so start early.
- [ ] **A password manager** — you will have about 10 keys.

## 2. Database (Supabase)

1. [ ] Create a new project. Region: Frankfurt is a good pick for Lebanon (it cannot change later). Save the Project URL, anon key, service_role key and database password.
2. [ ] SQL Editor → run `sql scripts/script.sql`. **Do not** run `migration.sql` on a new database.
3. [ ] If it errors on `pg_cron` / `pg_net` → Database → Extensions → turn them on → run the script again.
4. [ ] Authentication → Hooks → Customize access token → `public.custom_access_token_hook`. Without it the app shows no data.
5. [ ] Authentication → Sessions → refresh token reuse interval = `30`.
6. [ ] Recommended: Authentication → turn off "Allow new users to sign up". Only the edge functions and SuperAdmin create users, so this just blocks outsiders. Test creating an organization after.
7. [ ] Edge Functions → Secrets: `SERVICE_ROLE_KEY`, `ANON_KEY`, `PORTAL_JWT_SECRET`.
   - Make a random value: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - Never change `PORTAL_JWT_SECRET` later — every portal customer would be logged out.
8. [ ] Install the Supabase CLI → `supabase login` → in `SubsTrack/`: `supabase link --project-ref <prod ref>` → `npm run deploy-all-functions`.
9. [ ] Then, in `SubsTrack/`: `supabase functions deploy customer-status`.
   - If the CLI is blocked on your laptop: `cd Web && npm run build-edge`, then paste `SubsTrack/supabase/functions/_dashboard/customer-status/index.ts` in Dashboard → Edge Functions → Editor (name `customer-status`, "Verify JWT" ON).
10. [ ] Advisors → Security Advisor → check it is clean.
11. [ ] Set the options (SuperAdmin → Options):
    - `LiraRate`
    - `SupportWhatsAppNumber` — the login screen's "Get help" and "Contact us" open this WhatsApp.
    - `CustomerPortalUrl` = `https://portal.yourdomain` (no `/` at the end)
    - `WebsiteUrl` = `https://www.yourdomain` (no `/` at the end) — Privacy, Terms and Delete account links.
    - `AppDownloadUrl` — Play Store page or APK link, for phones too old to update by themselves.
    - `MinClientVersion` — leave blank. See "After launch".

## 3. Phone app (SubsTrack)

1. [ ] `eas login`. Same Expo account → keep the `projectId` in `app.json`. New account → run `eas init`.
2. [ ] Check the package name `com.hassanmostafaexpo.Sijil` now — it can never change after customers install the app.
3. [ ] EAS → Environment variables → **production**: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (prod values).
   - Builds and OTA updates read these, **never `.env`**.
   - Missing → the app crashes at start.
4. [ ] Build:
   - Google Play → `npm run build-prod` (makes an `.aab`).
   - Give the app file straight to customers → `npm run build-prod-apk` (makes an `.apk`).
5. [ ] Back up the signing key: `eas credentials` → download the keystore. Lose it outside Play = you can never update the app.
6. [ ] Google Play (if used): store listing, privacy policy address (`/privacy/`), Data safety form, account deletion link (`/delete-account/`), content rating, the closed test.
7. After launch: code-only changes → `npm run ota-prod`. Native changes → a new build.

## 4. Web sites (Vercel — one project each, set "Root Directory")

| Site | Root | Env vars | Domain |
|-|-|-|-|
| Customer portal | `Portal` | `VITE_PORTAL_FUNCTION_URL` = `<project url>/functions/v1/customer-portal`, `VITE_SUPABASE_ANON_KEY` | `portal.` |
| Staff web | `SubsTrack` (Expo web, live today) **or** `Web` (new, still preview) | Expo: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` · Web: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `app.` |
| Website | `Website` | none | `www.` |

- [ ] Portal and Web read files from `../Shared` — keep Vercel's "Include files outside the root directory" on.
- [ ] Pick ONE staff web for `app.`. Both have the `/whatsapp-connect` page.
- [ ] Website: fill the placeholders first ("Still to do by you", point 2).

## 5. SuperAdmin (your owner app)

- [ ] `SuperAdmin/.env`: prod `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SUPABASE_SERVICE_KEY`.
- [ ] Install it only on your own phone. Never share it, never put it on a store.
- [ ] New organizations are created here only — the app has no sign-up screen.
- [ ] An owner forgot the password → tenant details → Owner login → Reset password.

## 6. WhatsApp (optional — can come later)

Follow [docs/whatsapp-setup-guide.md](docs/whatsapp-setup-guide.md). In short:

- [ ] Meta app + Business Verification.
- [ ] 5 function secrets with **new** values: `META_APP_ID`, `META_APP_SECRET`, `WHATSAPP_TOKEN_KEY`, `WHATSAPP_WORKER_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
- [ ] 3 Vault secrets: `whatsapp_worker_url`, `whatsapp_worker_secret`, `whatsapp_worker_apikey`.
- [ ] Meta webhook = `<project url>/functions/v1/whatsapp-webhook?apikey=<anon key>`.
- [ ] Options `WhatsAppAppId`, `WhatsAppConfigId`, `WhatsAppConnectUrl`.
- [ ] Turn on "WhatsApp messaging allowed" per tenant.
- [ ] Meta App Review → switch the app to Live.

Keep a safe copy of `WHATSAPP_TOKEN_KEY` — if you lose it, every tenant must connect again.

## 7. Before you open to customers

- [ ] `cd tests && npm install --ignore-scripts && npm test` — all pass.
- [ ] Create an organization in SuperAdmin — the owner can log in.
- [ ] Open a customer — rows show (empty = auth hook is off).
- [ ] Add a staff user.
- [ ] Collect a payment — the month turns paid.
- [ ] Open a customer's portal link — same months as the app.
- [ ] Login screen: "Get help", "Contact us", Terms and Privacy open the right places.
- [ ] More → Delete my account → opens the Website deletion page.
- [ ] (WhatsApp) Send a reminder to your own phone — shows Delivered.

## 8. After launch

- Keep a separate **test** Supabase project for development. Never test on prod.
- Database change: run `migration.sql` first, then `script.sql` — **before** the OTA update that uses it.
- A database change old app versions must not write through: raise `CLIENT_VERSION` in the code, ship the update, then set `MinClientVersion` in SuperAdmin, and only then run the SQL. Old phones stop syncing and show "Update needed"; old web tabs ask to reload.
- Edge function changed → deploy it again (OTA does not reach functions).
- Take your own backup (`pg_dump`) from time to time — Pro keeps only 7 days.

## Sources

- [Google Play — account deletion rules](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Google Play — 12 testers for 14 days](https://www.testerscommunity.com/blog/google-play-closed-testing-requirements-2026)
- [Supabase pricing (pausing, backups)](https://supabase.com/pricing.md)
