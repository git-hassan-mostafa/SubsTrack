# WhatsApp Cloud API (per-tenant)

Each tenant connects **its own** WhatsApp Business Account (WABA) and phone number through Meta's **Embedded Signup v4**, and **Meta bills that tenant directly**. Sijil is a Meta **Tech Provider**: it never holds a credit line and never pays for a tenant's messages. Receipts still use `wa.me` links (`modules/invoicing`); the Cloud API sends **reminders and notices**.

Read this before touching `supabase/functions/whatsapp-*`, `supabase/functions/_shared/whatsapp/`, `src/modules/whatsapp/` or the `whatsapp_*` tables. Gotchas: #161–#167. The owner's step-by-step setup and test list is [whatsapp-setup-guide.md](whatsapp-setup-guide.md).

---

## 1. Moving parts

```
Admin app ─(JWT)→ whatsapp-admin / whatsapp-send ─→ whatsapp_messages (queue) ─→ Meta Graph API
   │ opens the browser with a one-time link                       ▲
   ▼                                                              │ pg_cron every minute → whatsapp-worker
Sijil WEB page /whatsapp-connect ─(session token)→ whatsapp-onboard ─→ Meta (code → token)
Meta ─(X-Hub-Signature-256)→ whatsapp-webhook ─→ statuses, template status, STOP, account events
```

| Function | Auth | What it does |
|---|---|---|
| `whatsapp-admin` | JWT, org-wide admin (`set_opt_out`: any admin, own branch) | `start_connect`, `refresh`, `submit_templates`, `disconnect`, `set_opt_out` |
| `whatsapp-onboard` | public; one-time session token | `complete` (code → token, ownership check, subscribe, register / coexistence sync, store, templates), `register_pin` |
| `whatsapp-send` | JWT, admin (branch admin: own branch) | `queue` — validates and inserts rows, replies at once, then sends in `EdgeRuntime.waitUntil`; `cancel_batch` |
| `whatsapp-worker` | `x-worker-secret` | drains due rows (~50 s budget) |
| `whatsapp-webhook` | public; HMAC-SHA256 of the raw body with the app secret | GET verify handshake; POST events |

Shared server code: `_shared/whatsapp/`. `rules.ts` and `sijilTemplates.ts` are **pure and import-free**. The app imports them through `@/supabase/functions/...` (the wa.me fallback text, the preview, the Graph version) and `tests/` covers them. Every other shared file is Deno-only.

## 2. Tables (server-only — never mirrored, see docs/offline.md)

| Table | Holds | Client access |
|---|---|---|
| `whatsapp_accounts` | one row per (tenant, phone number); `status` connected / needs_attention / disconnected; region, quality, daily tier, consent who/when | SELECT for tenant admins |
| `whatsapp_credentials` | AES-256-GCM token + PIN (`WHATSAPP_TOKEN_KEY`) | none (no policy) |
| `whatsapp_connect_sessions` | SHA-256 of the one-time link token, 15-minute expiry, pending token while a PIN is asked | none |
| `whatsapp_templates` | synced from Meta; `is_sijil`, `purpose`, `params`, `supported` | SELECT for tenant admins |
| `whatsapp_messages` | history **and** queue; `variables` only until Meta accepts | SELECT for admins, branch-scoped |
| `whatsapp_opt_outs` | numbers that must not be messaged (STOP or admin), soft-cleared | SELECT for tenant admins |

SQL functions (service role only): `whatsapp_claim_messages`, `whatsapp_apply_status` (forward-only, idempotent), `whatsapp_reached_last_day`, `whatsapp_kick_worker` (reads the worker URL, secret and anon key from **Vault**). The `whatsapp-worker` pg_cron job runs every minute and does nothing when no rows are due.

Owner switch: `tenants.whatsapp_enabled` (SuperAdmin), guarded by `trg_tenants_guard_billing`. Public Meta ids: `app_options.WhatsAppAppId`, `WhatsAppConfigId`, `WhatsAppConnectUrl`. Message language: `tenant_settings.WhatsAppLanguage` (`en` | `ar`).

## 3. Sending rules

- **Templates only.** A business-initiated message outside a customer-opened 24 h window must be an approved template. Sijil submits four UTILITY templates in en + ar on connect (`sijilTemplates.ts`): payment reminder, service outage, service back, general notice (free-text `details`). The tenant's own **approved** templates are listed too; Sijil fills BODY placeholders only.
- **The amounts are worked out in the app.** Unpaid months are not stored, so the server cannot compute them. `LedgerService.getOwedForCustomers` runs the ledger's own `mergeOwed` in chunks, and `reminderFacts` turns balances into `amount` / `period` / `due_date`. The server re-checks everything else: tenant, branch, active customer, phone (read from the DB and normalised to E.164 with the region of the tenant's number), opt-out, template approved, parameter shape, and not sent in the last 24 h unless forced.
- **Idempotency.** `idempotency_key = requestId:customerId`, unique per tenant. One request id covers a whole send, even in 200-recipient chunks.
- **Retries.** See `classifyMetaError`:
  - Retryable codes back off exponentially, at most 5 attempts.
  - Permanent codes fail at once.
  - Account-level codes (token 190, payment 131042, restricted 368, not registered 133010) set the account to `needs_attention`, which pauses its queue until **Check again**.
  - A **network failure** after the request left becomes `unknown` and is **never re-sent**. The webhook reconciles it through `biz_opaque_callback_data` = our row id.
- **Daily tier.** Before each new recipient the worker counts distinct numbers reached in the last 24 h (`whatsapp_reached_last_day`). Over the tier limit, the row is deferred by an hour. Queued rows older than 24 h are cancelled, because their amounts would be stale.
- **Not connected.** A one-customer reminder opens `wa.me` with the same template wording. Bulk sends and notices need a connection.

## 4. Meta setup (SaaS owner, once)

1. Meta Business portfolio for the company → **Business Verification**.
2. developers.facebook.com → create a Business app → add the **WhatsApp** use case → link the portfolio. Fill in the privacy policy, terms, icon, category and data deletion URL.
3. **Facebook Login for Business → Configurations** → Embedded Signup configuration with products **Cloud API** + **WhatsApp Business app onboarding**, permissions `whatsapp_business_management` + `whatsapp_business_messaging`, token expiry **Never**. Copy the configuration id.
4. Facebook Login for Business → Settings: Client OAuth login, Web OAuth login, Enforce HTTPS, Embedded Browser OAuth login, Strict mode and Login with JavaScript SDK all **on**. Add the Sijil web domain to **Allowed domains** and the connect URL to **Valid OAuth redirect URIs**.
5. WhatsApp → Configuration → Webhook:
   - URL: `https://<ref>.supabase.co/functions/v1/whatsapp-webhook`
   - Verify token: `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   - Fields: `messages`, `message_template_status_update`, `template_category_update`, `account_update`, `phone_number_quality_update`, `phone_number_name_update`, `business_capability_update`, `account_alerts`, `history`, `smb_app_state_sync`, `smb_message_echoes`
6. App Review → Advanced access for both permissions. Record one video per permission: a reminder arriving in WhatsApp, and **Submit templates again** creating templates.
7. App → **Live**. Before verification Meta allows 10 new tenant connections per 7 days (200 after).

## 5. Secrets and settings

- **Edge-function secrets:** `META_APP_ID`, `META_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_TOKEN_KEY` (32 random bytes, base64 — losing it means every tenant reconnects), `WHATSAPP_WORKER_SECRET`, plus the existing `SERVICE_ROLE_KEY` and `ANON_KEY`.
- **Vault** (Dashboard → Vault): `whatsapp_worker_url` = `https://<ref>.supabase.co/functions/v1/whatsapp-worker`, `whatsapp_worker_secret` = the same value as `WHATSAPP_WORKER_SECRET`, and `whatsapp_worker_apikey` = the anon key (the gateway 401s a call with no `apikey`, even with verify_jwt off).
- **Webhook callback URL** carries the anon key: `…/whatsapp-webhook?apikey=<anon key>`, because Meta cannot send headers.
- **Extensions:** `pg_cron`, `pg_net` (`script.sql` creates them).
- **Deploy:** `yarn deploy-whatsapp-functions` from inside `SubsTrack/`. The script changed the OTA fingerprint, so it came with a new native build (gotcha #53). Deploy the Sijil web build too, because it hosts `/whatsapp-connect`.
- **SuperAdmin → Options:** `WhatsAppAppId`, `WhatsAppConfigId`, `WhatsAppConnectUrl`. **SuperAdmin → Tenants:** "WhatsApp messaging allowed".

## 6. Tenant admin steps

1. Ask Sijil to allow WhatsApp.
2. Have a Facebook account.
3. Choose the number:
   - keep the **WhatsApp Business app** number (update the app; the phone keeps working), or
   - use a number that is **not** on WhatsApp.
4. Admin → WhatsApp: choose the language, tick consent, **Connect WhatsApp**, then follow Meta's window:
   - log in;
   - choose or create the business portfolio;
   - either scan the QR code with the WhatsApp Business app, or add the new number and type the SMS/call code;
   - confirm.
5. In **WhatsApp Manager → Overview → Add payment method**. Without it sends fail with "payment method".
6. Wait until the templates show **Approved** (minutes, up to 24 h).
7. Customers → select → **Send on WhatsApp**, or the row menu → **Send payment reminder**. Results are in Admin → **WhatsApp messages**.
8. Disconnect in Admin → WhatsApp. To fully remove access, also go to Meta Business Settings → Integrations → Connected apps.

## 7. Policy notes

- **Opt-in** is the tenant's duty. The admin confirms it at connect time (stored on the account). STOP / إيقاف replies are honoured automatically.
- WhatsApp's Business Messaging Policy **prohibits debt collection**. Reminders about the tenant's own bills are Meta's own utility examples, so the wording stays neutral. A template Meta re-classes as Marketing is flagged in the UI because it costs more.
- Pricing is per **delivered** template, by category and customer country (Lebanon = "Rest of Middle East"). From 2026-10-01, utility messages inside an open 24 h window are also charged.

## 8. Not testable locally

The Embedded Signup popup (needs an HTTPS allowed domain), real webhooks, template review, billing / payment method, coexistence (needs a real WhatsApp Business app phone), messaging-tier growth and App Review all need Meta's real environment. Test with your own business as the first tenant, a spare SIM (or a WhatsApp Business app number), and a Facebook account that has a role on the Meta app while it is in Development mode.
