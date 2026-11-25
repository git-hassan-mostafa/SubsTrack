# WhatsApp Cloud API (per-tenant)

Each tenant connects **its own** WABA + phone number, two ways: Meta **Embedded Signup v4** (default, Sijil's Meta app) or **own Meta app** (tenant pastes token + app secret, §3b). **Meta bills that tenant directly**. Sijil = Meta **Tech Provider**: never holds a credit line, never pays for tenant messages. Receipts still use `wa.me` links (`modules/invoicing`); Cloud API sends **reminders + notices**.

Read before touching `supabase/functions/whatsapp-*`, `supabase/functions/_shared/whatsapp/`, `Shared/src/modules/whatsapp/`, `SubsTrack/src/modules/whatsapp/`, `Web/src/modules/whatsapp/` or `whatsapp_*` tables. Client rules live once in Shared (`utils/whatsappMenu.ts`, `utils/whatsappView.ts`, `utils/embeddedSignup.ts`, hooks `useWhatsAppActions`/`useSendWhatsAppForm`/`useWhatsAppConnection`/`useEmbeddedSignup`); each app adds icons, layout and how it opens a URL. Gotchas #161–#170. Owner's step-by-step setup + test list: `docs/whatsapp-setup-guide.md`.

## 1. Moving parts

```
Admin app ─(JWT)→ whatsapp-admin / whatsapp-send ─→ whatsapp_messages (queue) ─→ Meta Graph API
   │ opens the browser with a one-time link                       ▲
   ▼                                                              │ pg_cron every minute → whatsapp-worker
Sijil WEB page /whatsapp-connect ─(session token)→ whatsapp-onboard ─→ Meta (code → token)
Meta ─(X-Hub-Signature-256)→ whatsapp-webhook ─→ statuses, template status, STOP, account events
```

|Function|Auth|Does|
|-|-|-|
|`whatsapp-admin`|JWT, org-wide admin (`set_opt_out`: any admin, own branch)|`start_connect`, `connect_own_app`, `webhook_info`, `refresh`, `submit_templates`, `disconnect`, `set_opt_out`|
|`whatsapp-onboard`|public; one-time session token|`complete` (code → token, ownership check, subscribe, register / coexistence sync, store, templates), `register_pin`|
|`whatsapp-send`|JWT, admin (branch admin: own branch)|`queue` — validates + inserts rows, replies at once, sends in `EdgeRuntime.waitUntil`; `cancel_batch`|
|`whatsapp-worker`|`x-worker-secret`|drains due rows (~50 s budget)|
|`whatsapp-webhook`|public; HMAC-SHA256 of raw body w/ the WABA's app secret (§3b)|GET verify handshake; POST events|

Shared server code `_shared/whatsapp/` (`optOuts.ts` records/clears opt-outs for webhook + `whatsapp-admin`; `connect.ts` = `saveAccount` / `setupTemplates` / `setWebhookOverride` for both connect ways; `ownApp.ts` = own-app discovery). `rules.ts` + `sijilTemplates.ts` are **pure + import-free**: app imports them via `@/supabase/functions/...` (wa.me fallback text, preview, Graph version), `tests/` covers them. Every other shared file is Deno-only.

## 2. Tables (server-only — never mirrored, see docs/offline.md)

|Table|Holds|Client access|
|-|-|-|
|`whatsapp_accounts`|one row per (tenant, phone number); `status` connected / needs_attention / disconnected; region, quality, daily tier, consent who/when; `app_id` (null = Sijil's app), `webhook_auto`|SELECT tenant admins|
|`whatsapp_credentials`|AES-256-GCM token + PIN + `app_secret_enc` (own app only) (`WHATSAPP_TOKEN_KEY`)|none (no policy)|
|`whatsapp_connect_sessions`|SHA-256 of one-time link token, 15-min expiry, pending token while PIN asked|none|
|`whatsapp_templates`|synced from Meta; `is_sijil`, `purpose`, `params`, `supported`|SELECT tenant admins|
|`whatsapp_messages`|history **and** queue; `variables` only until Meta accepts; read via `findMessagePage` (exact count, `branch_id` = `owned` scope)|SELECT admins, branch-scoped|
|`whatsapp_opt_outs`|numbers not to message (STOP or admin), soft-cleared|SELECT tenant admins|

SQL functions (service role only): `whatsapp_claim_messages`, `whatsapp_apply_status` (forward-only, idempotent), `whatsapp_reached_last_day`, `whatsapp_kick_worker` (reads worker URL, secret, anon key from **Vault**). `whatsapp-worker` pg_cron job every minute; no-op when no rows due.

Owner switch `tenants.whatsapp_enabled` (SuperAdminWeb), guarded by `trg_tenants_guard_billing`. Public Meta ids: `app_options.WhatsAppAppId`, `WhatsAppConfigId`, `WhatsAppConnectUrl`. Message language `tenant_settings.WhatsAppLanguage` (`en` | `ar`).

## 3. Sending rules

- **Templates only.** Business-initiated message outside a customer-opened 24 h window must be an approved template. On connect Sijil submits 5 UTILITY templates, en + ar (`sijilTemplates.ts`): payment reminder, renewal reminder (`paid_until`), service outage, service back, general notice (free-text `details`). A tenant connected before a template was added gets it only via **Submit templates again** (Admin → WhatsApp) — needs `whatsapp-admin` redeployed first. Names end `_v2` (renewal `_v3`); wording = factual, names the customer's subscription with the business, no thanks/apology/sign-off, **no call to renew/buy** (v1 `service_restored` ar + v2 renewal "please renew your subscription" were re-classed Marketing; v3 = account update: paid until + next payment due). Changing wording = bump the suffix (Meta blocks a deleted name 30 days); a `sijil_` name not in `SIJIL_TEMPLATES` is retired: `syncTemplates` hides it, `submitSijilTemplates` DELETEs it on Meta first (queued sends on it then fail). Tenant's own **approved** templates listed too; Sijil fills BODY placeholders only.
- **Amounts computed in the app** — unpaid months not stored, server can't compute them. `LedgerService.getOwedForCustomers` runs ledger's `mergeOwed` in chunks; `reminderFacts` turns balances into `amount` / `period` / `due_date`. Only bills due today or earlier count; part-paid future month (prepayment) or manual bill due later left out. Due date + period use month names of the message's language.
- **Paid until** (renewal reminder, placeholder source `paid_until`): `WhatsAppService.paidUntilTexts` reads month bills of active prepaid lines → `customerPrepaid` (`monthStatus.ts`, same fn as the list pill) → soonest-ending line's `paidUntil`, formatted by `messageDateText`. None (never paid / no prepaid line) → skip `no_paid_until`, never a blank date.
- **Values built in template's language.** Sijil template → tenant language; tenant's own template → its own language when `en…` or `ar…` (`messageLanguage`). Typed value capped in the field at same length `whatsapp-send` cuts it to (`paramMaxLength`); preview shows it on one line, as Meta receives it. Server re-checks all else: tenant, branch, active customer, phone (read from DB, normalised to E.164 w/ region of tenant's number), opt-out, template approved, parameter shape, not sent in last 24 h unless forced.
- **Idempotency.** `idempotency_key = requestId:customerId`, unique per tenant. One request id covers a whole send, even in 200-recipient chunks.
- **Retries** (`classifyMetaError`):
  - Retryable codes back off exponentially, max 5 attempts.
  - Permanent codes fail at once.
  - Account-level codes (token 190, payment 131042, restricted 368, not registered 133010) → account `needs_attention`, pausing its queue until **Check again**. The message that hit it goes **back to queue** w/ reason (sent after fix, or expires after 24 h); NOT marked failed.
  - **Network failure** after request left (incl. reply cut mid-body) → `unknown`, **never re-sent**. Webhook reconciles via `biz_opaque_callback_data` = our row id, and fills `accepted_at` so it counts toward daily tier.
  - Error thrown **before** request left (e.g. missing secret) → row back in queue for 5 min; never shown as `unknown`.
- **Daily tier.** Worker counts distinct numbers reached in last 24 h (`whatsapp_reached_last_day`); per claimed batch asks which of those numbers were already reached (never whole day in one read, #170). Over tier limit → new number's row deferred 1 h. Queued rows older than 24 h cancelled (amounts would be stale).
- **Opt-outs.** STOP reply + admin's **Stop messages** both go through `recordOptOut`, which also cancels that number's queued rows (#169). **Allow messages** clears the customer's current number + admin's own blocks for that customer. A STOP from a number the customer no longer has stays in force, but unlinked from the customer.
- **Template webhooks** via `templateStatusForEvent`: `REINSTATED` / `UNARCHIVED` → `APPROVED`; `FLAGGED` / `LOCKED` / `UNLOCKED` leave status alone (#168). Template whose buttons/header need a value Sijil can't fill (copy-code, dynamic URL, media, OTP, flow, catalog) stored as not supported (`isSendableTemplate`).
- **Not connected.** One-customer reminder opens `wa.me` w/ same template wording. Bulk sends + notices need a connection.
- **Connect page.** Trusts `postMessage` only from `facebook.com` or `*.facebook.com`. `FINISH_ONLY_WABA` (admin finished Meta's window w/o phone number) shows own message, never sent to server. Started from web app → page gets `?from=web`, and **Return to Sijil** goes back to Admin → WhatsApp (`/admin/whatsapp` in `Web/`; legacy Expo web = `/more/whatsapp`) in same tab instead of `sijil://`. `Web/` has its own `/whatsapp-connect` (public, outside `SessionGate`, reads options itself); `WhatsAppConnectUrl` decides which one Meta's link opens until H2. Native WhatsApp screen refetches when app returns to front.

## 3b. Own Meta app (alternative to Embedded Signup)

- **Secret rule (ONE place, `accountCredentials` in `accounts.ts`):** account w/ `app_secret_enc` → that secret; else `META_APP_SECRET`. Used for `appsecret_proof` on every Graph call (`graphRequest(method, path, creds)`) and webhook HMAC. #197.
- **Input = 2 values:** permanent system-user token + app secret. `connect_own_app` (`ownApp.ts`): `debug_token` w/ the token itself → `is_valid`, `app_id`, `expires_at === 0` (else `own_app_token_expires`), both `whatsapp_business_*` scopes; `assertAppSecret` (app token `appId|secret`); WABAs = scope `target_ids`, empty → `business_management` targets → `owned_whatsapp_business_accounts` (max 10); still none → `{status: "needs_waba"}`, admin types WABA ID (`wabaId`; found in Business Settings → Accounts → WhatsApp accounts, WhatsApp Manager URL `waba_id=`, or dashboard Step 1. Try it out; Meta now labels it **Messaging account ID** = same id (account model evolution), never the Phone number ID), checked via `{waba}/phone_numbers` w/ the token. System-user token debugger showing **"Applies to all objects"** = no `target_ids` (normal, not a mistake) → that path. Numbers = `{waba}/phone_numbers`.
- **Stateless steps:** answers `{status: "connected"}` | `{status: "needs_waba"}` | `{status: "choose_number", numbers}` (several numbers) | `{status: "needs_pin", phoneNumberId}` (status ≠ CONNECTED and register w/ random PIN hit 133005/133006). Client re-sends keys + `wabaId` / `phoneNumberId` / `pin` each step; nothing pending stored. Typed PIN wrong → `wrong_pin`.
- **Webhook:** `setWebhookOverride` = (1) plain `POST {waba}/subscribed_apps` (no events reach ANY callback without it; override w/o it = Meta code 100), (2) same w/ `override_callback_uri` (`…/whatsapp-webhook?apikey=<anon>`) + global `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, (3) override refused → `GET {app_id}/subscriptions` w/ app token `appId|secret`: `whatsapp_business_account` callback same origin+path as Sijil's + fields `messages`, `message_template_status_update`, `account_update` = admin's hand-pasted webhook works. `webhook_auto` = webhook confirmed working (override OR verified manual), not literally "auto". False → UI shows URL + token (`webhook_info`); **Check again** reruns all 3 while false. Logs: `webhook_subscribe_failed` / `webhook_override_failed` / `webhook_check_failed`. Suspect: Meta caps `override_callback_uri` at 200 chars; URL w/ anon JWT is longer → override likely always refused → manual path.
- **Switching ways:** `saveAccount` retires the live account when the number changes; app change (popup ↔ own app, same or other number) also unsubscribes the OLD app from the WABA, else its webhooks arrive signed w/ the wrong secret.
- Coexistence impossible here (Embedded Signup only) → own-app number is API-only. Tenant's app needs a privacy policy URL to go Live; Meta has no API to set it.
- Client: Shared `useOwnAppConnect` (steps) + pure `utils/ownAppForm.ts`; slice `connectOwnApp` / `loadWebhookInfo` / `webhookInfo`; `needsManualWebhook` in `whatsappView.ts`. Each app: `OwnAppConnectForm` + `WebhookSetupBox` inside `WhatsAppConnectionSection`.

## 4. Meta setup (SaaS owner, once)

1. Meta Business portfolio for the company → **Business Verification**.
2. developers.facebook.com → create Business app → add **WhatsApp** use case → link portfolio. Fill privacy policy, terms, icon, category, data deletion URL.
3. **Facebook Login for Business → Configurations** → Embedded Signup configuration: products **Cloud API** + **WhatsApp Business app onboarding**, permissions `whatsapp_business_management` + `whatsapp_business_messaging`, token expiry **Never**. Copy configuration id.
4. Facebook Login for Business → Settings: Client OAuth login, Web OAuth login, Enforce HTTPS, Embedded Browser OAuth login, Strict mode, Login with JavaScript SDK all **on**. Sijil web domain → **Allowed domains**; connect URL → **Valid OAuth redirect URIs**.
5. WhatsApp → Configuration → Webhook:
   - URL: `https://<ref>.supabase.co/functions/v1/whatsapp-webhook`
   - Verify token: `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   - Fields: `messages`, `message_template_status_update`, `template_category_update`, `account_update`, `phone_number_quality_update`, `phone_number_name_update`, `business_capability_update`, `account_alerts`, `history`, `smb_app_state_sync`, `smb_message_echoes`
6. App Review → Advanced access for both permissions. One video per permission: a reminder arriving in WhatsApp, and **Submit templates again** creating templates.
7. App → **Live**. Before verification Meta allows 10 new tenant connections per 7 days (200 after).

## 5. Secrets and settings

- **Edge-function secrets:** `META_APP_ID`, `META_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_TOKEN_KEY` (32 random bytes, base64 — lose it → every tenant reconnects), `WHATSAPP_WORKER_SECRET`, plus existing `SERVICE_ROLE_KEY`, `ANON_KEY`.
- **Vault** (Dashboard → Vault): `whatsapp_worker_url` = `https://<ref>.supabase.co/functions/v1/whatsapp-worker`, `whatsapp_worker_secret` = same value as `WHATSAPP_WORKER_SECRET`, `whatsapp_worker_apikey` = anon key (#167).
- **Webhook callback URL** carries anon key: `…/whatsapp-webhook?apikey=<anon key>` (#167).
- **Extensions:** `pg_cron`, `pg_net` (`script.sql` creates them).
- **Deploy:** `yarn deploy-whatsapp-functions` from inside `SubsTrack/`. That script changed the OTA fingerprint, so it came w/ a new native build (#53). Also deploy Sijil web build — it hosts `/whatsapp-connect`.
- **SuperAdminWeb → Options:** `WhatsAppAppId`, `WhatsAppConfigId`, `WhatsAppConnectUrl`. **SuperAdminWeb → Tenants:** "WhatsApp messaging allowed".

## 6. Tenant admin steps

1. Ask Sijil to allow WhatsApp.
2. Have a Facebook account.
3. Choose the number:
   - keep the **WhatsApp Business app** number (update the app; phone keeps working), or
   - a number **not** on WhatsApp.
4. More → Admin → WhatsApp: choose language, tick consent, **Connect WhatsApp**, then in Meta's window:
   - log in;
   - choose/create business portfolio;
   - scan QR w/ WhatsApp Business app, or add new number + type SMS/call code;
   - confirm.
5. **WhatsApp Manager → Overview → Add payment method**. Without it sends fail w/ "payment method".
6. Wait until templates show **Approved** (minutes, up to 24 h).
7. Customers → select → **Send on WhatsApp**, or row menu → **Send payment reminder**. Results in More → Admin → **WhatsApp messages**.
8. Disconnect in More → Admin → WhatsApp. To fully remove access also Meta Business Settings → Integrations → Connected apps.

**Own-app tenant instead (§3b):** developers.facebook.com → Business app → WhatsApp → add + verify number → Business Settings → System users → add, assign app + WABA (full control) → generate token AFTER assigning (token made before = no access) (expiry **Never**, `whatsapp_business_messaging` + `whatsapp_business_management`) → App settings → Basic: copy **App secret**, add privacy policy URL → app **Live** → Sijil: More → Admin → WhatsApp → tick consent → **Use my own Meta app instead** → paste both → Connect. Payment method + templates same as above.

## 7. Policy notes

- **Opt-in** = tenant's duty. Admin confirms at connect (stored on account). STOP / إيقاف replies honoured automatically.
- Business Messaging Policy **prohibits debt collection**. Reminders about tenant's own bills are Meta's own utility examples → wording stays neutral. Template Meta re-classes as Marketing is flagged in UI (costs more).
- Pricing per **delivered** template, by category + customer country (Lebanon = "Rest of Middle East"). From 2026-10-01 utility messages inside an open 24 h window are also charged.

## 7b. Meta setup facts (found while testing)

- **Own-app number** must be added + verified in Meta first (dashboard: Connect on WhatsApp → Production setup → Add phone number; old name WhatsApp → API Setup; SMS/call code); Sijil only finds + registers it (PIN), never verifies.
- **"Use a display name with a virtual number instead"** (Add phone number dropdown) = Meta test number `+1 555…`, auto-verified, max 2 per business, may stop after ~5 msgs until display name approved (Kapso/SendPulse docs, no Meta page) → testing only.
- **SIM needed once** (code). After connect, sends go via Meta; SIM only for re-verify / move. Lapsed prepaid SIM → number may be recycled to someone else.
- Free "receive SMS" sites: shared + often refused by Meta → never. Landline works via **Phone call** code.
- **Business info form** (new assets): Website required — Facebook/Instagram page or Sijil web URL ok; must match business name for Business Verification. Category = sender's business (ISP/generator → Other); no effect on price or template category.
- **Messaging limit** per business portfolio: new = 250 unique customers / 24 h (business-initiated only; replies unlimited), grows 2K → 10K → 100K. Shown as "Customers per day".
- **Templates in Meta:** WhatsApp Manager → Account tools → Message templates (tenant's portfolio). New WABA gets Meta samples (`jaspers_market_*`, `hello_world`) → delete by hand. Meta may re-class Utility → Marketing per language (⚠ in list); review requestable within 60 days.
- **Embedded Signup:** every WABA needs a business portfolio; Meta's window creates one (Facebook account + name, no documents). Number = any number tenant owns, not on personal WhatsApp, not on another API account.

- **Recipient phone = ONE rule `internationalPhoneDigits`** (`_shared/digits.ts`, zero-import, via `@edge/digits`): Arabic digits → Latin; `+…` / `00…` / `961…` kept; else strip leading 0s + prefix `961` (Lebanon, target market). Cloud API: `toE164(raw, defaultRegion)` (`phone.ts`, libphonenumber) tries the sending number's region (`regionOf`) first, then that rule (so a +1 555 test number no longer breaks `03123456`). Every wa.me link (`whatsAppChatUrl`, `canSendWhatsApp`) uses the rule too — before, `03123456` → broken `wa.me/03123456`. Shared `toLatinDigits` re-exported from the same file. Tests `tests/suites/phoneDigits.test.ts`.
- **Failure reason:** webhook stores `error_code` + `error_title`; `messageErrorText` shows `meta_error_detail` (title + code) when the code has no own key. 131030 = test number, recipient not in allowed list. 131058 = Meta sample `hello_world` sent from a non-test number (Meta allows it only from Public Test Numbers) → use Sijil templates; sample still listed as a tenant own template until deleted in WhatsApp Manager.

## 8. Not testable locally

Need Meta's real environment: Embedded Signup popup (needs HTTPS allowed domain), real webhooks, template review, billing / payment method, coexistence (needs real WhatsApp Business app phone), messaging-tier growth, App Review. Test w/ own business as first tenant, spare SIM (or WhatsApp Business app number), and a Facebook account w/ a role on the Meta app while in Development mode.
