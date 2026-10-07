# Feature Deep-Dives

> Per-feature behavior; read the section BEFORE editing that area. Month Grid algorithm stays in `CLAUDE.md`.

## Contents

Multi-Tenancy · Branches · Authentication Flow · Multi-Month Plans · Multi-Currency · App Options · Tenant Settings · Allowances & Requests · Products & One-Off Sales (Services) · Reports · Expenses · WhatsApp Cloud API · WhatsApp Invoices · Transactions Hub · The Ledger · Regular Customer · Skipped Months · Customer Map Location · Multiple Plans per Customer · Pay Oldest Month First · Payment Scenarios · Multi-Select & Bulk Actions · Audit Trail · Developer Tools · Collector Wallet

---

## Multi-Tenancy

RLS primary (JWT claims); app filter (`tenant_id` from `authStore`) secondary. `tenant_id` put in JWT by a Supabase auth hook at login. Login email = synthetic `username@tenantcode.com`.

---

## Branches (multi-location)

Optional; zero branches → feature invisible.

**`branch_id IS NULL` means:** `users` → tenant-wide admin (all branches + unassigned) · `customers` → UNASSIGNED, tenant-wide admins only · `plans` → SHARED, every branch · `charges`/`collections` → matters only for walk-in row (no customer): tenant-wide admins only; others follow customer.

**RLS:** `public.current_branch_id()` (SECURITY DEFINER) reads caller's `users.branch_id`. Row admitted if `tenant_id` matches AND (`current_branch_id() IS NULL` OR branch matches); plans also admit `branch_id IS NULL` for all. `charges`/`collections` inherit via `EXISTS (SELECT 1 FROM customers c WHERE c.id = charges.customer_id AND c.branch_id = current_branch_id())`; walk-in matches own `branch_id`. `collection_items` inherit via collection. Tenant-wide admin's branch switch = UI state `uiPrefStore.currentBranchId` only, no JWT change.

**UI:**
- `SubsTrack/src/shared/components/BranchSelector.tsx` — chip under `PageHeader` on Customers/Dashboard/Plans/Users; renders only for tenant-wide admins (`user.branchId === null`) w/ ≥1 active branch. Options: All Branches (`null`) / each active branch / Unassigned (`BRANCH_FILTER_UNASSIGNED`).
- `useEffectiveBranchFilter()` / `resolveBranchFilter(user)` (`Shared/src/shared/lib/branchFilter.ts`): branch-scoped → own `branchId`; tenant-wide → `uiPrefStore.currentBranchId`.
- `applyBranchFilter(query, filter, column?)`: `null` → no-op, `BRANCH_FILTER_UNASSIGNED` → `.is(column, null)`, UUID → `.eq(column, uuid)`.

**Forms:**
- CustomerFormSheet: branch picker tenant-wide admins only; branch-scoped auto-assign own. Plan dropdown = `branch_id IS NULL OR branch_id = selected_branch`; Plans editor's `PlanPicker` **disabled** ("Select a branch first") while `branchId === null` (branch required first) — via `Dropdown` `disabled`/`disabledHint`, threaded through `PlanPicker`.
- PlanFormSheet: picker tenant-wide only, nullable (= Shared), mirrors ProductFormSheet; branch-scoped → own-branch plans.
- UserFormSheet: picker for tenant-wide admin; once ≥1 branch, role=`user` needs a branch (`UserService.validate`); `create-user` edge function also validates + forces branch_id for branch-scoped callers.

Full rules → gotchas #26–#32.

---

## Authentication Flow

```
app/index.tsx
  → authSlice.restoreSession()   (on mount)
  → no session → (auth)/login
  → session → (app)/(tabs)/home (admin) or (app)/(tabs)/customers (user)

LoginScreen
  → authSlice.login(username, tenantCode, password)
  → AuthService: email = `${username}@${tenantCode}.com`
  → AuthRepository.signIn(email, password)   [Supabase Auth]
  → AuthRepository.getUserProfile(userId)    [public.users]
  → AuthRepository.getTenant(tenantId)       [tenants row: allowance + price]
  → stores AuthUser + tenantActive in authSlice
  → primePostAuth(user) — Promise.all of:
       get().currencies.fetchCurrencies()
       get().branches.fetchBranches()
       get().options.fetchOptions()         (global app_options — e.g. LiraRate)
       get().billing.init(tenantId)
         → seeds both limits + pricePerPlanUsd from auth-time tenant row
         → customerService.countActive(null) + line count — TENANT-WIDE
         → refreshRequest() — the one pending customer_requests row, if any

"Create a new organization" → signupSlice:
  Step 1 (SignupOrganizationScreen)
    → signupSlice.validateAndCheckCode()
    → SignupService.validateOrganization() + repo.isTenantCodeAvailable()
    → push /(auth)/signup-account
  Step 2 (SignupAccountScreen)
    → signupSlice.submit() → SignupService.createTenant() → SignupRepository.createTenant()
    → supabase.functions.invoke('create-tenant') [service-role]
       atomically: tenants(billing columns omitted → schema DEFAULTs) →
       branches('Default Branch') → auth.users → public.users(role=superadmin, branch_id=null)
       cascading rollback on any step
    → auto-login via authSlice.login(...) → root layout routes on authSlice.user

app/(app)/_layout.tsx
  → !user → login · !tenantActive → TenantInactiveScreen · else tabs
```

`primePostAuth(get, user)` is internal, called by `login` + `restoreSession`. `create-tenant` → `docs/edge-functions.md`; anon path → #33.

---

## Multi-Month Plans

1–12 consecutive months. `durationMonths > 1` → **bundled price** for whole period; **must be fixed price** (`isCustomPrice` = `false`); ONE `Payment` w/ that `durationMonths` covers the range.

**Recording (`duration_months > 1`):** build coverage set from active payments → if any month already paid: `skipConflicts = false` throws listing them; `skipConflicts = true` → first uncovered month, adjust `effectiveStart` + `effectiveDuration`, one payment for the rest → returns `{ payment, skippedMonths }` for UI.

```typescript
type MultiMonthConflict = { billingMonth: string; label: string };
type CreateMultiMonthPaymentResult = { payment: Payment; skippedMonths: MultiMonthConflict[] };
```

Storage + grid → #13, #14, #15.

---

## Multi-Currency

Any non-USD currencies per tenant; USD = implicit base, never in `currencies`.

**Amount stored as typed + `currency_id`:**
- `plans.price` + `plans.currency_id` (literally `89000 LBP`, not 1.00 USD); plan USD equivalent uses **live** rate (forward pricing).
- `charges.amount` (BILLED) / `collections.amount` (HANDED OVER), each own `currency_id` + `rate_per_usd_snapshot`: LBP value kept forever, USD frozen at row's time. Rates deliberately separate: debt totals at billed rate; revenue + wallet at cash-arrival rate. `BillSheet`, year totals, dashboard aggregates use snapshot → no drift on live-rate edit.
- `null currency_id` = USD everywhere; USD rows snapshot = 1.

**Helpers** (`Shared/src/core/utils/currency.ts`):

```ts
toUsd(amount, source: Currency | null): number       // null → unchanged
fromUsd(amountUsd, target: Currency | null): number  // null → unchanged
convert(amount, source, target): number              // via USD
formatMoney(amount, source, target): string  // convert + Intl.NumberFormat
findCurrency(currencies, id | null): Currency | null
snapshotCurrency(row, currencies): Currency | null  // ratePerUsd = row's frozen snapshot; use for every historical bill/payment display
```

**`CurrencyInput`** (`SubsTrack/src/shared/components/CurrencyInput.tsx`): input + currency dropdown (USD + active currencies); in PlanFormSheet (price), CollectSheet (amount received). Switching currency does NOT convert the number ("I meant this in the new currency").

**Display currency per-TENANT, not device**: `tenant_settings` key `DisplayCurrencyId` (`currencies.id`; blank = USD), admin sets in Tenant Settings, read via `useDisplayCurrencyId()`; others get a change on next sync/login. Read-only displays (PlanCard, DashboardScreen, admin/index revenue card, CustomerPaymentPanel year summary) convert at render. `BillSheet` primary line = **stored** currency (receipt fidelity), secondary "≈" line in display currency. Soft-deleted/unknown id → `findCurrency` `null` → USD, no crash.

**Dashboard aggregates**: `DashboardService.getMetrics()` sums each row → USD by its `rate_per_usd_snapshot`; screen formats in display currency.

**Last-used currency** in `Shared/src/shared/lib/uiPrefStore.ts` → `CurrencyInput` default.

**Delete**: `CurrencyService.deleteCurrency()` counts refs in `plans`, `charges`, `collections`, `customer_plans.custom_currency_id`; >0 → soft (`active = false`), else hard. FKs `ON DELETE RESTRICT` guard history.

**Default LBP**: each new tenant seeded `LBP` (`decimals = 0`, `symbol = 'ل.ل'`), `rate_per_usd` copied **once at creation** from `app_options.LiraRate`, then ordinary editable (no live link). Both paths seed: SuperAdmin `TenantService.createTenant` (`TenantRepository.getLiraRate` + `createLbpCurrency`) and `create-tenant` edge function; bad/missing `LiraRate` never blocks signup → `DEFAULT_LIRA_RATE = 89000`.

Snapshot rules → #18, #19, #21, #22, #24, #36.

---

## App Options (Global Config)

`app_options`: **global** key/value (no `tenant_id`), SaaS-owner config. Columns `id`, `key` (unique), `value` (text), `description`, timestamps. Keys:
- `LiraRate` — default LBP per 1 USD, seeds new tenants' LBP.
- `AllowSelfServiceSignup` (`'true'`/`'false'`, default true) — `false` → login hides "Create organization" **and** `create-tenant` rejects (`403`, `code: signup_disabled`); server authoritative.
- `SupportWhatsAppNumber` — intl digits only; `UpdateAllowanceSheet` "Send request + WhatsApp" deep-link; blank hides button.

- **RLS:** `app_options_select` → `SELECT` for **`anon` + `authenticated`** (anon: flags gate pre-auth UI). **No** write policy → only service role (SuperAdmin + `create-tenant`) writes.
- **SuperAdmin**: CRUD in **Options** tab (`SuperAdmin/app/(tabs)/options.tsx` → `OptionsScreen`); module = repository + service + standalone `optionStore` + screen + `OptionFormSheet` (create + delete). Key **immutable after creation** (only `value`/`description` edit) so code-read keys can't be renamed away.
- **SubsTrack**: **read-only** module (repository `findAll`/`findByKey`, `OptionService.getOptions`/`getOptionValue`, `optionSlice`, `useOptionSlice`). Fetched **at bootstrap** (`app/_layout.tsx`, pre-auth login needs flags) + re-primed in `primePostAuth`; **not** reset on `logout`. Keys via `OPTION_KEYS`, never magic strings. Hooks in `Shared/src/state/hooks/useOptionSlice.ts`: `useOptionValue(key)`, `useBooleanOption(key, fallback)`, `useSelfServiceSignupEnabled()`, `useSupportWhatsAppNumber()`. Conditional UI → gate in `SubsTrack/src/shared/components/FeatureGate.tsx`: `<CanCreateOrganization>` renders `children` or `fallback` (no flag ternaries in screens). WhatsApp links → `openWhatsApp()` (`SubsTrack/src/shared/lib/whatsapp.ts`).

See #38.

---

## Tenant Settings (Per-Tenant Config)

`tenant_settings` = tenant-scoped twin of `app_options` (+ `tenant_id`), written **in-app by admins**. Columns `id`, `tenant_id`, `key`, `value`, timestamps; `UNIQUE(tenant_id, key)`.

- **RLS:** `tenant_settings_select` → every member (non-admin collector needs values); `tenant_settings_write` → `ALL` for `admin`/`superadmin`. Both on `current_tenant_id()`.
- **Module** `src/modules/admin/tenant-settings/`: repository (platform switch) + service + mapper + `TENANT_SETTING_KEYS`. `TenantSettingService` **parses** raw strings → typed; no caller reads a raw value — except unpaid rule, parsed by pure `parseUnpaidStartRule` (`tenant-settings/utils/unpaidStartRule.ts`) b/c `customer-status` edge function runs it.
- **State:** `tenantSettings` slice, loaded in `primePostAuth`, **reset on logout** (unlike `options`; must not leak to next tenant). Hooks `Shared/src/state/hooks/useTenantSettingSlice.ts`: `useTenantSettingValue(key)`, `useUnpaidStartRule()`. Keys via `TENANT_SETTING_KEYS`.
- **UI:** Admin → Tenant Settings, one section per setting (`UnpaidRuleSection`, card layout like `DisplayCurrencySection`). Save refreshes current-month badge sets (rule restates which months are unpaid).
- **Offline:** synced table; write derives **deterministic id from `(tenant_id, key)`**, upserts on natural key (in `NATURAL_KEYS` **and** `sync/push.ts` `conflictTarget`) → two offline devices converge on one row, no UNIQUE-index push stall.

**Keys:** `UnpaidStartRule` (`'month_start'` default \| `'customer_start_day'`) — when a month turns unpaid + when "Overdue" starts. Under `'customer_start_day'` **two** facts: current month grey until line's billing day (`isNotDueYet`); last month red but not _late_ until that day (`isNotLateYet`) — #83. Rule → `CLAUDE.md` Month Grid; helpers in `customer-payments/utils/monthDueRules.ts` (grid + customer-list aggregator).

**New key:** `TENANT_SETTING_KEYS` + typed setter/parser in `TenantSettingService` + semantic hook + screen section. No schema change.

---

## Allowances & Requests

No tiers. Billed per **active service line** at one price; also capped on **active customers**; all else unlimited. Three `tenants` columns:
- `customer_allowance INT NOT NULL DEFAULT 30` — 30 = start AND hard **floor** (`chk_tenants_customer_allowance_min`) for every tenant.
- `plan_allowance INT NOT NULL DEFAULT 30` — active `customer_plans`; the bill's count. ≥ `customer_allowance` (`chk_tenants_plan_allowance_floor`; each customer needs ≥1 line). Live DB: `sql scripts/migration.sql` before `script.sql` → #149h.
- `price_per_plan_usd NUMERIC(10,4) NOT NULL DEFAULT 0.15` — USD/line/month; 4dp b/c fractions of a cent, round only at total.

**Why two limits** → #149; line limit decides the bill, customer limit = second cap on list size. **"Active line" = line AND customer active** (plain `WHERE active` keeps billing a customer who left); join written 3× (`CustomerPlanRepository.countActive`, offline twin, `lower_allowances()`), must agree → #149b.

**Columns OWNER-ONLY, locked twice:** (1) **no UPDATE policy on `tenants`** (`tenants_update` dropped; app never writes it); (2) **`trg_tenants_guard_billing`** RAISEs when role is `authenticated`/`anon` and any of the three changes — tests ROLE not `auth.uid()` (#149i); survives a permissive policy re-added later, blocks leaked-token self-raise. Only service role writes (SuperAdmin, edge functions).

**Only exception, DOWN only:** `lower_allowances(p_customer_allowance INT, p_plan_allowance INT)`, `SECURITY DEFINER`. **Both in ONE call** (`plan_allowance >= customer_allowance` leaves no safe order for two). Refuses: non-active-`admin`/`superadmin` caller, non-cut, line < customer limit, either < tenant's **live active counts** (own `SELECT COUNT(*)`, never client numbers). Either arg above current RAISEs — raising only via owner-accepted request.

Limits + price ride on auth-time `AuthRepository.getTenant` row (**no extra fetch**); only the two counts + pending request hit network.

**Module** `src/modules/admin/billing/`: `services/BillingService.ts`; `ICustomerRequestRepository`/`CustomerRequestRepository`/`CustomerRequestRepository.offline` + `IAllowanceRepository`/`AllowanceRepository`/`AllowanceRepository.offline` (RPC); `utils/allowanceChange.ts` (`signedText`), `utils/requestAsk.ts` (`requestedPair`, `askText`), `utils/` `quotaError.ts`, `allowanceFloorError.ts`, `types.ts`, `mapper.ts`; five components. **State** global `Shared/src/state/slices/billing/billingSlice.ts`: `limits`, `active` (`QuotaPair` `{ customers, plans }`), `pricePerPlanUsd`, `request`, `loading`, `saving`, `error`, `floorError`, `quotaError`; `init`/`refreshCounts`/`refreshRequest`/`bumpActive`/`lowerAllowances`/`requestMore`/`editRequest`/`cancelRequest`/`setQuotaError`/`clearQuotaError`/`clearError`/`reset`; via `useBillingSlice`. `authSlice.primePostAuth` → `billing.init(tenantId)`; `logout` → `billing.reset()`.

---

### The two caps

`QuotaPair` `{ customers: number; plans: number }` = every limit/count/ask pair (no 4 loose ints). Gate `billingService.assertQuotas(limits, before, after)` walks `QUOTA_KINDS` (customers first), throws `QuotaExceededError` (`Shared/src/modules/admin/billing/utils/quotaError.ts`) `{kind, limit, activeCount}` on first breach; checks a kind only if `after[kind] > before[kind]` (#149c).
- `CustomerService.createCustomer(data, tenantId, limits, active, addingLines)`: `after` = `{ customers: +1, plans: +addingLines }`, before customer row written (#149d).
- `CustomerPlanService.syncLines(…, existingLines, limits, activeCounts)`: `after.plans` = `activeCounts.plans − existingLines.length + lines.length` (nets removals + reactivations).

`customerSlice` + `customerPlanSlice` catch `instanceof` → `get().billing.setQuotaError(e)`: one field, one modal, both limits. Only `CustomerFormSheet` renders a limit modal (other five form sheets uncapped). Slices read `limits`/`active` from `get().billing` inside the action, not via component.

**Counts TENANT-WIDE**: `customerService.countActive(null)`, `customerPlanService.countActive()` skip branch clause on both platforms. `customers` slice `activeCount` is **branch-filtered** → never drives a cap (branch admin would see room tenant lacks).

**Write-patched by delta**, never absolute/re-fetch: `billing.bumpActive` — create `+1` customer, line sync net change, deactivate/reactivate/delete/bulk-delete `∓1` customer + `∓` its active lines (`activeLines(customer)`). Only re-read: `refreshActiveData.ts` → `s.billing.refreshCounts()`.

---

### `QuotaReachedModal`

Title/body/icon from `payload.kind` (one component, both walls). Tenant-wide admins (`user.branchId === null`) → button to **Organization Settings**; branch admins/staff → "ask your administrator" (button = dead end).

---

### The settings card

`<CustomerAllowanceSection />` (`SubsTrack/src/modules/admin/billing/components/CustomerAllowanceSection.tsx`), **above** `<DisplayCurrencySection />` on `TenantSettingsScreen`:
- **TWO `<UsageBar />`s** (customers, lines; bar takes `kind`, own labels): big `used / total`, track, "N more … available" / "you have used your whole limit". Indigo, **amber from 80%**, **red at/over**.
- **Monthly amount** `BillingService.monthlyAmountUsd(active.plans, pricePerPlanUsd)`, 2dp, note `N active × $price` (100 × $0.15 = $15.00). Tested: `7 × 0.15` → `1.05`, not `1.0499999…`.
- Then: **"Update your limits"** button, or **amber pending block** (Edit / Cancel), or **red "declined"** note above button.

Re-reads request **on focus** (owner may decide meanwhile). **Amount ALWAYS USD** (`$` + `toFixed(2)`), **never** display-currency formatter — tenant-editable `currencies.rate_per_usd` would let it rewrite its bill.

---

### Update your limits — one sheet, both limits, both directions

`<UpdateAllowanceSheet />` (`SubsTrack/src/modules/admin/billing/components/UpdateAllowanceSheet.tsx`), card's only button. Two `<AllowanceField />`s (Allowed customers, Allowed service lines), each = **new total** + **Change** box between **−**/**+** (`+20` green, `-20` red, none → **empty** not `+0`; `signedText`).

**ONE state per field**: change = view `total − current`, typing it sets total → no drift. Both `useTextField` w/ `expectedEcho` (twin-rewritten field = #134). Raising customers **carries lines up** (no error).

**Save path by direction:**
- **Cut only** → `lowerAllowances(total)` → RPC, **immediate** behind confirm; no request (smaller only costs less).
- **Any raise** → `requestMore` → one `customer_requests` row, **both** asks; "Send request + WhatsApp" only here.
- **Raise + cut** refused (`billing.mixed_change_error`) — approval vs instant = half a save.

**Cut floor = per-limit ACTIVE COUNT, checked twice:** (1) `BillingService.validateDecrease(next, current, active)` throws `AllowanceFloorError` (`utils/allowanceFloorError.ts`) `{kind, requested, activeCount}` → amber **"Deactivate N customers first"** / **"Cancel N service lines first"**, Save disabled; (2) **Postgres wins** — `lower_allowances()` re-counts for JWT tenant (client counts cached/forgeable). Coded refusals `active_customers_exceed_limit:<active>:<requested>` / `active_plans_exceed_limit:<active>:<requested>` vs `ALLOWANCE_FLOOR_CODES` (`utils/types.ts`) → same typed error, no sentence parsing; slice `floorError: AllowanceFloorPayload | null` beside `error: string`.

**Three floors, highest binds:** `MIN_CUSTOMER_ALLOWANCE = 30`, that limit's active count, (lines) customer limit. Equal legal, below not.

**Patch TWO places**: `billing.limits` AND auth tenant — `billing.init` re-seeds from `auth.user.tenant` on restore, else old numbers return. **Online-only**: `AllowanceRepository.offline` throws `RequiresConnectionError` (mirror can't answer live counts).

---

### `customer_requests` — lifecycle

Tenant **asks** to raise; owner grants. Columns `id`, `tenant_id`, `requested_count`, `requested_plans`, `granted_count`, `granted_plans`, `status` (`pending` \| `accepted` \| `declined` \| `cancelled`), `requested_by`, `decided_by`, `decided_at`, `created_at`, `updated_at`.

**One row, both limits**; either half may be 0; min 10 on the **total** (`chk_customer_requests_total_min`). Old `chk_customer_requests_min` **dropped by name** in `migration.sql` (guarded `DO` never re-evaluates an existing constraint).

**One pending per tenant** by partial unique index (not app logic; holds across devices; history unlimited):

```sql
CREATE UNIQUE INDEX uq_customer_requests_one_pending
  ON customer_requests (tenant_id) WHERE status = 'pending';
```

**RLS:** every member SELECTs (staff see room coming); admins INSERT, born **pending + undecided**; admins UPDATE pending rows only, status only `'pending'` (edit) or `'cancelled'` — **never** `'accepted'`.

**Accept = ONE call** `accept_customer_request(p_request_id UUID, p_granted INT, p_granted_plans INT)`: `SECURITY DEFINER`, `REVOKE`d from `anon`/`authenticated`/`public`; marks accepted + raises both (torn write mis-bills). Line limit = `GREATEST(plan_allowance + granted_plans, customer_allowance + granted)`. Two-arg version **dropped by signature** in `migration.sql` (old overload would keep answering). **Decline** = plain update.

**Min ask**: `BillingService.validateRequest(extra)` throws if `extra.customers + extra.plans < MIN_CUSTOMER_REQUEST` (`utils/types.ts`), matches DB `CHECK` (1-slot ask not worth a human round trip).

---

### Editing a pending request

**Edit request** reopens `<UpdateAllowanceSheet editing />` (no separate sheet). **Raise-only**: opens on limit + already asked (`requestedPair(request)`), floor = current limit (not `MIN_CUSTOMER_ALLOWANCE`), no decrease branch, Save → `editRequest(extra)`. Title **Edit request**, button **Save request**; "Send request + WhatsApp" kept (correction still worth sending support).

---

### SuperAdmin side

- **`TenantCard`**: `{customers} customers · {lines} lines ·  each` + **ORANGE `Requested +N customers / +N lines` pill** when pending.
- **`TenantFormSheet`**: **"Customer Allowance"**, **"Service Line Allowance"**, **"Price Per Service Line (USD)"** on create **and** edit (owner's direct path); line field inline error while < customer field. Pending → **Accept / Decline** block on top, **"Grant customers"**/**"Grant service lines"** default to ask (may grant fewer); 0 on **both** refused.
- **Trap:** after accept **re-sync both inputs** (lines via same `GREATEST`) — else next Save writes pre-accept numbers over the raise.
- **`TenantService.getTenants()`** = `Promise.all([findAll(), findPendingRequests()])`, zipped; `findPendingRequests` = **one flat query, not PostgREST embed** (embed drags all history rows).
- **2 tabs**: Tenants, Options.

---

### Offline

Limits ride the `tenants` row in read-through auth cache → **caps work offline** (refuses 31st customer w/o network); counts from mirror → advisory, like `SaleService` oversell (#149g). `customer_requests` **not mirrored**: `CustomerRequestRepository.offline` throws `RequiresConnectionError` from **every** method (human message; offline queue = pending block nobody sees, merges would fight one-pending index).

---

### Audit trail

`AuditTable` tracks `'customer_requests'`, not `'tenants'` (app never writes `tenants`). Key `audit.table.customer_requests` = "Customer request". No `tier_changed` summary, no `audit.field.tier_id`.

---

### Tenant creation

`create-tenant`: no tier lookup; **omits billing columns** → `DEFAULT`s (30 customers, $0.15). Defaults = contract → **redeploy before SQL runs** (edge functions **not** OTA):

```
supabase functions deploy create-tenant --no-verify-jwt
```

---

### Tests

`tests/suites/customerAllowance.test.ts` (TC-CA-01..11): monthly amount, 2dp (`7 × 0.15` → `1.05`), cap blocks **at** allowance, min-10 request. Imports `BillingService` from Shared file (no barrels → no stub).

---

## Products & One-Off Sales

`products` + `services` + `sales` extend beyond subscriptions. Sale holds no money: owes = `charges` row (kind `sale`), paid = `collections`, same ledger as a month bill (see The Ledger → The sale writes its own bill). Month-grid logic untouched.

**Products** mirror `plans`: per-tenant catalog, optional currency, `branch_id IS NULL` = SHARED; soft-delete (`active = false`) if it has historical sales, else hard-delete (like `CurrencyService.deleteCurrency`) — keyed off **`sale_items.product_id`** refs, not `sales`. Uncapped.

**Sale = header + lines; a line sells a product OR a service**, any mix (a "cart"), at least one of something. Mirrors `customers` → `customer_plans`.

- **`sales` (header)** — `items_summary`, `total_amount`, `currency_id` + `rate_per_usd_snapshot`, `customer_id`, `recorded_by_user_id`, `sold_at`, void fields. **No money, no custody**: owes = its `charges` row (`kind = 'sale'`, same transaction), collected = `collections` → installments. `Sale.amountPaid` is **derived** by `SaleService.withMoney` from the bill's balance.
  - `items_summary` — **frozen** summary of every line incl. services (`"Water ×2, Installation"`), built by service at create; powers Sales-tab **search** + list / debt / wallet labels (no `sale_items` join).
  - `total_amount` — **app-written, TYPEABLE** (gotcha #142): form seeds from line sum, re-seeds on line change; user may type any figure (discount, bundle, whole sale w/ no lines). `SaleService.totalOf()` = one decider (`input.totalAmount ?? lineSumOf(items)`) = bill amount → anything owed = one "sale" debt. Line `unit_amount`s never rewritten (receipt may not add up). Snapshot; only an edit moves it.
  - `rate_per_usd_snapshot` — rate at sale time, drift-free like `charges` / `collections.rate_per_usd_snapshot`. Display via `snapshotCurrency(sale, currencies)` (any row w/ `currencyId` + `ratePerUsdSnapshot`).
  - `customer_id` **nullable** — walk-in = `customer_id = NULL`.
  - `voided_at` / `voided_by` / `void_reason` soft-void stamps header only (`sale_items` go only on hard delete, `ON DELETE CASCADE`). No hard delete of active sales.
- **`sale_items` (lines)** — `sale_id`, `line_type` (`'product'` | `'service'`), nullable `product_id` / `service_id`, `item_name_snapshot` (frozen), `quantity` (**always 1 on service**), `unit_amount` (frozen, sale currency), `voided_at` (only when an **edit** dropped it). `line_total = unit_amount * quantity` derived in mapper. No `branch_id` — RLS inherits parent sale (`EXISTS`), like `collection_items`. `ON DELETE CASCADE` from `sales`; `ON DELETE RESTRICT` on **both** `product_id` + `service_id` (so ref counts include voided lines). `chk_sale_items_line_ref`: `'product'` = product, no service; `'service'` = no product, service **optional** (none = one-off typed job).
  - Renamed from `product_name_snapshot` (guarded rename in `script.sql` + local backfill, mirror additive-only) → gotcha #99 before renaming anything mirrored.

**One currency per sale, auto-convert.** One currency + rate frozen (debt / wallet / dashboard math need it). `SaleFormSheet` has one currency selector; an added catalog item (product **or** service) is converted at live rate (`convert()`, `Shared/src/core/utils/currency.ts`) as editable prefill. First catalog item picked sets sale default currency (until changed); changing currency re-prices every catalog line from its own price — **one-off** service keeps its typed amount. Cart rules in Shared, both apps: `useSaleCart` (`Shared/src/modules/transaction/sales/hooks/`) owns rows + currency, computes `SaleCartDraft` (`lines` / `total` / `currency` / `ready` / `dirty` / `signature`) in render over pure `utils/saleCart.ts`; `useSaleForm` owns customer, typed total, money collected, two save confirms + cash-rebuild confirm, over `utils/saleForm.ts` (`SaleService.updateSale` asks same `rebuildsSaleCash`). Phone `SaleFormSheet` / `SaleItemsEditor`, web `SaleFormDialog` / `SaleItemsEditor` only draw. Optional initial cart = saved sale (edit). Cart answers `dirty` **itself** from row signature (incl. `lineType` / `serviceId` / typed name, else a flip to service reads untouched); typed total re-filled only when signature changes (gotcha #179).

**Create = header then lines.** `SaleService.createSale` resolves `total_amount` (typed, else line sum) + `items_summary` (`sales.no_items_summary` if no lines); `SaleRepository.create` inserts header then lines (web sequential like customer + `customer_plans`; offline one SQLite transaction, parents-first via `PUSH_WAVES`). List/detail join `sale_items(*, products(*), services(*))`, both LEFT; lean reads (`partialSales`, `heldForWallet`, dashboard totals) header columns only.

### Services

**Service** = labour (installation, repair, router setup) — never a fake product (would hit stock ledger + derived stock expenses).

**Is:** a **line on a sale** — no service record, no Services tab, no fourth money stream; every money figure reads the sale's one bill, so revenue, debts, wallet, Reports, WhatsApp invoices, CSV got services with no new aggregation. Read gotcha #98 before any "services revenue" figure.

**Is NOT:** stocked or costed — no `stock_movements`, no oversell check, no expense; staff pay still hand-typed under `salaries` expense category. Stock paths narrow via `productLines()` / `savedProductLines()` (`sales/utils/saleLines.ts`), never a nullable-id test (gotcha #97).

**Price list (`services`).** Admin → Services (admin menu). Products screen minus stock/cost: name, description, price + currency, branch (`branch_id IS NULL` = SHARED), `active`. `UNIQUE(tenant_id, branch_id, name)` + RLS `services_select` / `services_modify` copied verbatim from `products` → **collector** can add one from the sale form; branch user writes own branch only. Uncapped. Soft-delete if any sale line refs it (voided lines count, FK `ON DELETE RESTRICT`), else hard — same two-mode `deleteService` as products + batch counterpart. Audited; **History** on card menu via `useHistoryDoor('services')`.

Layers: `src/modules/admin/service-catalog/` — repository (+ `.offline`, platform switch), `ServiceCatalogService`, `ServiceListScreen`, `ServiceCard`, `ServiceFormSheet`, `services` slice w/ `loaded` guard. Not `ServiceService` / `admin/services/services/…` b/c "service" names the whole layer.

**Picking one.** Kind = which dashed footer button added the line (**+ Add product** / **+ Add service**); card only labels it (icon + word, `#n` when several). No per-row `Product | Service` switch, zero rows on a new sale, last row removable (= how kind changes), goods + labour = two lines → gotcha #101. Service dropdown = active catalog services (priced in sale currency) + final **"Other — type a name"** → name field (web: no "Other" row — the service box is free text, `ServicePicker`; typing replaces a picked service) = **one-off** (`service_id IS NULL`, `item_name_snapshot` is the whole record, no catalog row). Inline "+" add prices the row from the object just saved, not a store lookup (misses it that render).

**Service line: NO quantity, only a price** — no stock cap, no "N left", no stepper; one **Price** field = line total; two jobs = two lines → gotcha #100 (type-enforced: `service` variant of `CreateSaleItemInput` has no `quantity`; `lineQuantity()` returns 1; `sale_items.quantity` stores 1; no `1 × …` on receipt/WhatsApp).

**Validation** (`SaleService.validate`): product line needs catalog row (`errors.sale_product_required`) **and** positive integer qty; service line needs non-blank resolved name (`errors.sale_service_required`, keeps `NOT NULL` name legal), no qty rule. Positive `unit_amount` shared.

**Edit an existing sale.** In place (void + re-record lost the receipt id + left a dead row). **Any staff**, from row **3-dot menu** or receipt **Edit sale**, on all three surfaces (Sales tab, customer panel, per-customer page). **One form**: `SaleFormSheet` optional `sale` prop switches title / button / submit; no second form. **Voided** sale never offers it (`SaleService.updateSale` refuses; both repos filter `voided_at IS NULL`).

Changeable: lines (incl. product ↔ service), qty, unit prices, currency, customer, amount collected, notes. Fixed: `id`, `tenant_id`, `sold_at`, original `recorded_by_user_id` (corrector in audit trail). Five rules, all → gotcha #90: currency change **re-freezes** `rate_per_usd_snapshot` (#21; drives historical USD totals); `SaleRepository.update` **swaps** movements, never reverses (#48), only when per-product units change (`SaleService.sameStockFootprint`), service lines invisible to it (#97); sale's own units credited (`assertStockAvailable` `credited` map, `SaleItemsEditor` stock credit), product **deactivated** since the sale kept on its line, barred from new ones; dropped line soft-voided (`voided_at`, no `sale_items` tombstones), matched **by position**, filtered in `mapDbSaleToSale` and skipped by Sales-tab product filter; walk-in edit keeps `sale.branchId` (create rule `customer.branchId ?? user.branchId` would move it to "no branch").

Cash on edit → gotcha #111: payment section = total collected (`UpdateSaleInput.collectedTotal`), capped at typed total; raise = one extra hand-over dated today; lower or currency move w/ money = **rebuild** via `collectionService.unpayCharge` (other bills' slices re-created, original date + collector kept), Save confirms naming both amounts. **No custody lock**. One audit entry per sale (`action: 'update'`, changed columns only); `sale_items` + `stock_movements` un-audited — changed `items_summary` / `total_amount` report a re-cut cart.

**Receipt (`SaleDetailSheet`).** Lines in **own card** apart from customer / sold-at / receipt-ID: "Items" header (cart icon + count when >1), per line: numbered bubble, `item_name_snapshot` (service prefixed w/ small `construct-outline` mark), `qty × unit price` sub-line, line total right. Totals footer (Total, + Paid / Remaining if partial) only for multi-line or partial. Hero caption → "{{count}} items" when >1 line. Lean read (empty `items`) skips card.

Below: **every payment that reached the sale** — `BillPaymentsList` (as month bill sheet) fed sale's `chargeId` + currency snapshot. Row per hand-over: amount _against this sale_, date, collector, "also paid other bills" note, 3-dot: **Send on WhatsApp** (customer + phone only), **Void payment** (refreshes screen behind, sale owes again). Lean read has no `chargeId` → not rendered, nothing fetched.

**Row actions (`useSaleActions`).** 3-dot on every row holds everything (nothing only via receipt): **View receipt · Edit sale · Complete · Send invoice on WhatsApp · History · Void sale**. **Voided** → view + history only. WhatsApp row **visible + disabled w/ caption** for walk-in / no phone ("explain, don't vanish", as invoice selection action).

**Collect** only while sale owes and has a customer. Opens the same `CollectSheet` as every bill (one door: custody, audit, currency rules in one place). Old **Complete** gone (`amount_paid` had no date → only a rewrite could fix a short entry); now the second payment is recorded on its day. Hook takes `onCollected` (created `Collection`); form `onCreated` / `onUpdated` carry saved `Sale` → the two customer-scoped lists patch from the row. Sales tab needs neither: `ledger.collect` → `sales.applyCollection`, slice patches list + month totals (gotcha #116).

Set defined **once** in `sales/hooks/useSaleActions.tsx`, used by all three surfaces. Hook owns `ActionMenu`, shared-reason void dialog, record-history sheet; screens keep receipt sheet + sale form (own refresh callbacks).

- **One menu per SCREEN, not per card** — sales lists paginated + virtualized; per-card = a bottom sheet per row (debts / expenses cards do mount their own). `SaleCard` only raises `onMenu(sale)`.
- **One void dialog for one sale and a selection** — `requestVoid(sales)` feeds `SaleBulkVoidSheet` from card menu + multi-select toolbar → same reason box + `voidSales` (title/message have `_one` plural forms).

**Branch semantics:** `products.branch_id` like `plans` (`NULL` = SHARED, all branches). `sales.branch_id` like `customers` — `NULL` only when tenant-wide admin records a walk-in w/o branch; RLS scopes branch users to own branch. `sale_items` inherits via parent.

**`AsyncEntityPicker`** (`SubsTrack/src/shared/components/AsyncEntityPicker.tsx`) — customer picker built for `SaleFormSheet`, generic `<T>`, caller passes `loadPage(search, page)`; reuses `SearchTextBox`, `useDebounce` (300 ms), `requestToken` ref drops stale responses (like `customerSlice.searchToken`). Only for lists too big for memory; small static lists keep `Dropdown` (gotcha #37).

**Sales tab filters** (`SalesPanel` chip bar): search (`items_summary` + customer name), customer (`CustomerPicker`), product (`Dropdown` of active products, lazy `fetchProducts` on mount; repo resolves via `sale_items`), **From/To** (`DatePickerInput` `triggerStyle="chip"`, bound each other via `minDate`/`maxDate`). Non-search filters on `sales` slice (`customerFilter`, `productFilter`, `fromDate`, `toDate`) → `saleService.getSales` → `SaleRepository.findAll`; days → `sold_at` bounds (end via next-day-exclusive). "Clear filters" chip (≥1 active) → `clearFilters`. **Status** chip (`status`: `live` | `voided` | `all`, never null): **`live` = default + unfiltered**, voided rows only when asked. `live` rides `Dropdown`'s NULL slot so chip stays grey (`value !== null` = active indigo); `clearFilters` + `reset` → `live`; only a departure counts in `hasActiveFilters` / `isFiltered`. Same options as collections filters (`includeVoided` / `voidedOnly`, both repos). Voided `SaleCard`: dimmed, struck amount, red **VOIDED** chip + reason; menu view + history; toolbar **Void** skips it. **Month totals exclude voided rows** — `monthlyTotals` returns nothing under "Voided only" (only place header < its rows). `applyVoidedSales(items, voided, keepVoided)` keeps a voided row (marked) when status admits it, else drops → voiding a viewed row never vanishes it.

**Customer sales surfaces:** `CustomerSalesPanel` at **bottom** of customer detail (below grid + details). Read = Shared `useCustomerSalesPreview(customerId, limit, onRead)` (reads `limit + 1`; web uses 10); owed / collect door = Shared `saleFacts()` (`sales/utils/saleView.ts`). **5-sale preview**; more → "Show all" → `CustomerSalesListScreen` (`customers/[id]/sales`), Sales tab clone (search, infinite scroll, record FAB, void) locked to one customer. **List reads independent of global `sales` slice** (panel `saleService.getSalesForCustomer` w/ stale-token guard; page `useCustomerSalesList`) → never clobber Sales tab state. **Mutations go through the global slice** (cache coherent): create `SaleFormSheet` → `saleSlice.createSale` (unshift), void `saleSlice.voidSale` (drops from `sales.items`); each surface then refreshes its list. No branch filter — **all** customer's sales.

Both have **multi-select → one WhatsApp receipt** (`useSaleInvoiceAction`): long-press enters, tap ticks, one receipt for all. Full page: header `SelectionBar` w/ select-all. **Preview panel**: `InlineSelectionToolbar` replaces title row, **no select-all**, fixed `h-9` wrapper (cards don't shift under the finger), hides "Show all"; selection cleared on every `refresh()` (new sale can push a ticked row out). Bulk **void** only full page + Sales tab.

**Dashboard:** `DashboardService.getMetrics()` = **one** cash read `collectionService.collectedInRange` + `saleService.countInRange` (activity count). `monthlyRevenue = subscriptionRevenue + salesRevenue + manualRevenue`, sub-line lists non-zero streams only; split by `charges.kind` over the SAME rows → **sum exactly**. USD via row's frozen `rate_per_usd_snapshot`, formatted to display currency at render.

**Revenue = cash collected** (`collection_items` by `collections.received_at`; never `sales.total_amount` / `charges.amount`): partial counts only what arrived, rest enters revenue when collected. Item-side read files a sale-debt payment under sales (no under-reporting "debts" bucket). `salesCount` = every sale row, paid or not (`SaleRepository.countInRange`).

**Home analytics** (`getMetrics()`, branch-scoped, USD):

- **Month-over-month** — `prevMonthRevenue`, only comparison; **no revenue chart** (`RevenuePoint`, `getRevenueTrend`, slice `trend` removed). Hero ▲/▼ % pill ("vs last month") when prior month had revenue. `DashboardService.getMonthCollections(year, month, branchFilter)` (private) = month's cash by what it settled + `paymentsCollectedCount` / `salesCount`, **only** issuer of the revenue query: called twice in `getMetrics()`'s `Promise.all` (month, `month - 1`) → same read, scoped by `collections.received_at` (never `billing_month`) → like-with-like by construction. `Date` turns month 0 into last December.
- **Growth** — `newCustomersThisMonth` / `cancelledThisMonth` via `customer.countCreatedInRange` / `countCancelledInRange` (`created_at` / `cancelled_at`, `[monthStart, monthEndExclusive)`).
- **Activity** — `paymentsCollectedCount` (positive-amount rows in `paidAmountsForMonth`, by `paid_at`), `salesCount` (`totalsForMonth` row count). **Avg payment** = `subscriptionRevenue / paymentsCollectedCount` ("Payments" tile sub-line).
- **Total debt tile** — only **all-time** figure. `totalDebt` = `ledgerService.getDebtsView().summary.totalUsd` (= Debts header). Sub-line `monthsDebt` / `salesDebt` / `manualDebt` **sums exactly** (each row carries its balance).
  - Also in hero: red chip (`bg-red-400/20`, matches decline pill) `Owed by customers −$383.00`, only if `totalDebt > 0`, below breakdown, wrapping row w/ orange `Expenses $X` chip. **Only red chip has a minus** — spending unsigned like `outflowLabel()` on Expenses tab (screens agree on sign). Tint + minus load-bearing: the one figure **not** collected must read as outflow. Tile keeps reconciling breakdown; chip = glance.
  - Hero breakdown: **Subscriptions and Sales** (+ hand-typed fees if any); money filed by what it paid for (sale-debt cash under Sales), no "hide collected debts" rule.
  - Money in (number + streams) vs money out (chips) never mix: collecting a debt raises total, lowers red chip.

**Hero figures + every tile = Shared `dashboard/utils/dashboardView.ts`** (both apps): `revenueHero(metrics, isAdmin)` → ▲/▼ % (`null` if prior month 0), mix (subscriptions / sales / manual, only when 2+ earned), `showExpenses` (admin **and** something spent), owed, net, paid-of-due % (100 when nothing due); `dashboardTiles(metrics, isAdmin)` → `{ key, labelKey, value: KpiValue, subKey, subValues, tone: Tone, page: PageKey, wide }` (expenses + net admin-only when spent, wallets admin when > 0, debt when > 0). Values via `formatKpiValue` (loss = `−$5`). Phone `RevenueHeroCard` (tap → Reports, "Reports ›" pill; flat `bg-white/10` insets, `bg-primary` **is** indigo-500) + `StatTile` grid (half tiles pair, `wide` = full row; `STAT_TONE` Tone → tile tone); web `DashboardPage` = hero + `StatCard` tiles linking to their page (`TILE_PATH`). Dashboard store keeps a `ReadStamp` (`ensureMetrics`: re-read only when branch / `ledger.owedVersion` moved). Every range query: Supabase + Offline SQLite behind `ICollectionRepository` / `IChargeRepository` / `ISaleRepository` / `ICustomerRepository`.

**Nothing here capped** (products, services, sales, stock movements); only cap = customer allowance (see Customer Allowance & Requests).

### Stock

**Computed at runtime** (like Debts, Collector Wallet) — `Product.stockOnHand = SUM(stock_movements.quantity_delta)` over non-voided rows; can be **out of stock**. **No counter on `products`** (whole-row latest-`updated_at`-wins push → two offline sales write the same number, one vanishes; additive rows merge).

**`stock_movements`** — `product_id`, signed `quantity_delta` (never 0), `reason`, `sale_id` (`'sale'` only), `unit_cost` + `currency_id` + `rate_per_usd_snapshot` (buy cost), `note`, `recorded_by_user_id`, `occurred_at`, soft-void fields.

|Reason|Written by|Sign|
|-|-|-|
|`initial`|"Starting stock" on **product create**|+|
|`restock`|stock sheet "Add", or **batch restock**|+|
|`adjustment`|stock sheet "Remove" (damage, miscount, wrong entry)|−|
|`sale`|`SaleService.createSale`, one per line|−|

**Reading.** Web: `product_stock` view (`SUM(quantity_delta) … WHERE voided_at IS NULL GROUP BY product_id, tenant_id`, **must** be `WITH (security_invoker = true)`, PG 15+, else leaks every tenant). Offline: same `GROUP BY` on mirror, no view. Both = `IProductRepository.stockOnHand(ids?)` → `Record<productId, number>`; absent = 0. `ProductService.getProducts` folds it into each `Product`.

**Branch scope from the PRODUCT, not the sale** → gotcha #48: `stock_movements_all` mirrors `products_select` (`current_branch_id() IS NULL OR p.branch_id IS NULL OR p.branch_id = current_branch_id()`), **not** `sale_items_all` (would make SHARED products unsellable for branch users). Shared product = one pool. `WITH CHECK` allows shared too (unlike `products_modify`).

**Writing.**

- **Sale create** — one negative `'sale'` movement per line in `CreateSalePayload.movements`, written w/ header + lines (offline same transaction) → no sale without its stock.
- **Sale void** — movements **soft-voided** (`UPDATE … WHERE sale_id = ? AND voided_at IS NULL`), never opposite rows; one statement, idempotent (repeat = no-op, no double return). Bulk inherits (`saleSlice.voidSales` loops `saleService.voidSale`).
- **Manual** — `ProductService.addStock` appends one `restock` row. **Manual entry only ADDS** — no remove form; bad delivery fixed on its own entry (Editing / Reverting below). Never delete a row; never hand-touch a `'sale'` row.
- **Batch restock** — `ProductService.restockMany(entries, tenantId, note, userId)` → one `restock` row **per product** in one `addMovements` call (offline one transaction), returns on-hand map → `productSlice.batchRestock` patches w/o refetch. No "batch" reason / grouping row; shared note copied to every row.

**Blocking.** `SaleService.createSale` → `assertStockAvailable` after `validate()`: **fresh** `stockOnHand` read (store may be stale), qty summed **per product across cart lines**; throws `errors.sale_out_of_stock` / `errors.sale_insufficient_stock`; in service → every entry point covered. `SaleItemsEditor` soft guard: out-of-stock greyed (`DropdownOption.disabled`), stepper caps at on-hand minus other rows, "N left" per row, oversold → `ready: false`. **Advisory**; DB allows negative (gotcha #48).

**UI.** `ProductCard` chip: green "N in stock" / red "Out of stock" / red "Short by N". `ProductStockSheet` (row menu "Adjust Stock" or edit-form link): on-hand, add-only qty + cost + note, every movement newest-first (occurred_at → created_at → id; offline via julianday, ISO formats mix), starting stock last — reason icon tinted green add / red remove, reason, date **and** time (`formatDateTime`), recorder (users slice via `recordedByUserId`), note, **3-dot** on correctable rows (Edit entry · History), "Reversed" chip + struck amount on voided. Amber warning if save goes **below zero**, never blocks (gotcha #48). `ProductFormSheet` "Starting stock" **create only**; edit shows it read-only + "Adjust Stock" link (never free-typed).

`ProductBatchRestockSheet`: search + every **active** product as compact row (name, on-hand, `[−] qty [+]`). Row w/ qty turns indigo + previews `3 → 8`, no reorder. One shared note; summary "N products selected · +40" above save. Qty keyed by product id (filter keeps typed values). Entry points: **Restock** button beside products search; **Batch Restock** in PageHeader quick actions (admin-only).

**Cost.** Movement may carry unit buy cost: `unit_cost` + `currency_id` + `rate_per_usd_snapshot`, together via `ProductService.movement()` or all null — only money on `stock_movements`, makes buying stock an expense (see Expenses). `products.cost_price` + `cost_currency_id` = live _default_ pre-filling restock forms, never frozen; each delivery freezes its own. Optional: no-cost restock adds no expense (as legacy rows). `'sale'` movement never has cost (stock leaving ≠ money leaving; enforced in `movement()`).

**Cost typed in three places:** product form **Cost price** (default + opening stock cost on create); stock sheet **Cost per unit** / **Total cost**; **batch restock** — one **delivery currency** per save, each picked row's cost seeded from cost price at live rate (`SaleItemsEditor` rule; currency change re-prices all). History shows "Cost: $X", or green "Money back: $X" on negative rows.

**Stock expense comes down through the ENTRY, never a second row** — negative costed row = credit (`amount = quantity_delta × unit_cost`), but no new one can be written (no Remove mode); doors = **Edit entry** / **Revert entry**, both in the **entry's own month** (July fix in August drops July). Credit shape kept for older rows + editing them. **No door** for stock that really left later (damaged, lost, stolen, returned) — count drops only by selling or editing the adding entry.

**Per unit ↔ total.** Typing either recomputes the other (`total = unit × qty`, `unit = total ÷ qty`). Only **`unit_cost`** saved → derived unit keeps **8 decimals** (`stock_movements.unit_cost` precision; 100 ÷ 3 → 33.33 would record 99.99). **Last typed field = anchor**; qty change recomputes the _other_ (45 total, 10 → 12 units → unit 3.75, total 45). Abandoned edit / picking Edit resets anchor to "unit". One currency: picker on per-unit, total locked to it.

#### Editing a stock entry

Manual movement corrected in place: `ProductService.updateMovement` → `IProductRepository.updateMovement`, history 3-dot → **Edit entry**. Two doors (rules → gotcha #96):

| |**Edit**|**Revert**|
|-|-|-|
|When|entry **written** wrong (12 for 10; cost 0.50 vs 0.45)|entry should **not exist** (wrong product, saved twice)|
|History|10 arrived|row stays, struck, "Reversed"|
|Month|entry's **own** — July → $5.00|entry's **own** — July's $6.00 goes|

Manual entry can't _remove_ stock, so "12 arrived, 2 went back" is no longer written (older data may hold it; gotchas #94 / #96).

Changeable: **quantity**, **cost + currency**, **note** only; `occurred_at` (decides the month), `reason`, `product_id`, identity locked (`UpdateStockMovementPayload`). Service guards: `'sale'` row refused (`errors.stock_movement_sale_locked`); voided refused; qty as **magnitude**, sign from row; oversell only warned (gotcha #48). Rate re-freezes only when amount/currency moved (gotchas #21 / #90); `ProductService.costFields()` builds the trio, shared w/ `movement()`.

Audit: why `stock_movements` is audited (see Audit Trail) — only **edit** / **revert** logged, filed under parent product's branch + name (`auditedUpdate` `audit` option); readable via row's **History**.

**UI.** One form for add + edit (like `SaleFormSheet`): Edit fills qty / cost / note, "Editing this entry" banner (direction locked, Cancel ✕, note on when edit is wrong tool), button "Save Changes". Edit **scrolls body to top** (`scrollBody.current?.(0)` via `FormSheet` `scrollRef` prop — ref, not context, gotcha #102), else form looks dead. Save **keeps sheet open**, reloads history (correction believable beside rows it fixed), resets form to first-render state (unsaved-changes guard quiet).

#### Reverting a stock entry

For an entry that should never exist. Same 3-dot (**Revert entry**, red, last), confirm dialog, **any staff**.

**Soft-void** (`voided_at` + `voided_by`): leaves stock sum (`product_stock` / mirror `GROUP BY` live only) and Expenses; row stays greyed w/ "Reversed" (rule 7; answers "where did the other 12 bottles go"). Month = entry's own (July reverted in August drops July). Old costed _removal_ (credited recorded month) gone w/ Remove mode (see Stock → cost, gotchas #94 / #96).

**Refused in the SERVICE** for same rows as edit: `ProductService.revertMovement` + `updateMovement` share `liveManualMovement(id)`. `stock_movements.voidMovement` = one write, audited as **`void`** w/ product branch + name; reverted row's menu keeps only **History**; `'sale'` row has no menu.

**UI.** Confirm names entry ("Stock added +12 will stop counting…") + totals effect. Success: sheet stays open, history reloads, form filled from that row resets (else Save Changes targets a dead entry).

See gotchas #35, #36, #37, #48, #88, #89, #94, #96.

---

## Reports

Dashboard = "how is **this month**?"; Reports tab = "how is the business over any period I choose" — few curated sections for an ISP owner, not a query builder.

**Admin-only** (like Expenses, dashboard): `href: isAdmin ? undefined : null`.

### The page

Phone: `PageHeader` (branch chip + CSV export) → `PeriodPicker` → `SegmentedTabs` → section cards: **Money**, **Debts**. Web has 7 sections (below, "Web Reports").

**Period** (`Shared/src/core/utils/dateRange.ts`): `ReportPeriod { preset, fromDate, toDate }`, presets _This month · Last month · Last 3 / 6 / 12 months · This year · Custom_. Presets = **whole calendar months** (end on last day of final month) → buckets + comparison window same shape. `previousPeriod()` shifts by whole months (custom: own day count). Also `dayStartIso` / `nextDayStartIso` / `rangeFromDays` (shared by four repos + expense slice).

### Money

|Block|Shows|
|-|-|
|KPIs|Collected · Spent · Net · Margin, ▲/▼ pill vs previous same-length period|
|Money in|By stream, inline share bar|
|Money out|By expense category (incl. derived `stock`)|
|Collected by currency|**Physically** collected per currency, own currency + `≈` display value|

### Debts

|Block|Shows|
|-|-|
|KPIs|Still owed (**all time**) · Collected on debts (**this period**) · Customers owing · Behind on payments (**to today**, ignores period)|
|Who owes the most|Top 10 debtors + months behind, tap → customer|
|What is owed for|Gross by category (months / sales / custom)|

Only one figure period-scoped, labelled apart → gotcha #91.

### How the data is built

**Money out** = no new query: `ExpenseService.getExpensesView` → `ExpenseItem[]` (date, amount, currency, frozen rate, branch, staff, category, product), stock half merged, gotcha #88 semantics.

**Money in** = three new reads, one per stream, all returning `CollectedRow`:

|Repository|Method|
|-|-|
|`ICollectionRepository`|`collectedInRange(startIso, endExclusiveIso, branchFilter)` — ONE read, one row per bill settled, every row (`readEveryRow`)|
|`ISaleRepository`|`findInRange(…)` — live sales + lines (web Sales / Staff)|
|`ICustomerRepository`|`findEveryWithLines(branchFilter)` — every customer (web Customers); `findAllForStatus` (ageing) also past the row cap|

Each on its table's repository (never a cross-table `ReportsRepository` — would re-derive `BRANCH_SCOPES`), Supabase + offline twin. `ReportsService` tags `stream`, merges to `CashRow[]`.

All else = **pure client-side aggregation**, `reports/utils/aggregate.ts` (`sumByKey`, `topN`, `shareOfTotal`, `delta`); **one query per stream per window** (12 months = 1 month round trips). Revenue = cash, same read as dashboard (both `CollectionService.collectedInRange`, USD via frozen `rate_per_usd_snapshot`) → must reconcile to the cent for one month (acceptance test).

### Drill-down

Breakdown row / debts card → `RecordsSheet`: **filter over rows in memory**, never a second query → sums to the tapped figure.

### Export

CSV → share sheet (`expo-file-system` + `expo-sharing`); web (`expo-sharing` no-op) → browser download. `Shared/src/shared/lib/csv.ts`: RFC-4180 quoting + UTF-8 BOM (commas, Arabic in Excel). Spending written **negative** → Amount sums to Net.

### Reusable pieces

Phase-2 report = config + data hook over `ReportSection` (loading / error / empty / pull-to-refresh), `KpiRow`, `ReportCard`, `BreakdownList`, `RankedList`, `ComparisonPill`, `CurrencySplit`, `RecordsSheet`; palette `reports/utils/reportColors.ts` (stream keeps colour).

**No charts** — `react-native-svg` + `react-native-gifted-charts` removed (native rebuild for decoration). Don't reintroduce unless a figure can't be read as a list. Web bars = plain `Box` (`ShareBar`), no chart library either.

Phone KPIs + drill rows come from Shared: `reportKpis.ts` (`moneyKpis`, `debtsKpis`, `ReportKpi { labelKey, value: KpiValue, tone: Tone, hintKey, delta }`, `formatKpiValue`) → phone `toKpis()`; `reportRecords.ts` (`cashRecords`, `expenseRecords`, `debtCollectedRecords`, `debtItemRecords`, `saleRecords`, `withTotal`).

### Web Reports (G2) — "any number, for anyone, any filter"

Sections (`reportSections.ts`, `ReportSection`): **Overview** (`money`) · **Money in** · **Money out** · **Debts** · **Customers** · **Sales** · **Staff**; phone shows only `money` + `debts`. One period for all; each section keeps its own view `{ filter, groupBy, grain }` in the store (`views`), so switching sections keeps filters. Changing a view never reads (gotcha #121).

**Data = 4 datasets** read per section (`SECTION_DATASETS`; sales + staff also need money), each kept with a `ReadStamp` (branch + `ledger.owedVersion`): `ensureSection()` reads only missing/stale, `fetchSection()` forces, `setPeriod` drops all. `money` (cash + expenses + **previous-period rows**, so a filtered view still compares), `debts` (+ full `debtors`), `customers` (`customer.findEveryWithLines` — every customer, active or not, with lines), `sales` (`sale.findInRange` headers + lines, current + previous period; **no money join**). Every read `readEveryRow` (gotcha #175). Registered in `refreshActiveData` (`reloadIfLoaded`).

**Engine** `reports/utils/analysis.ts`: a section = rows + `keyOf(row, dim)` (a row may have several keys — customer with 2 plans); `applyFilter`, `filterOptions` (faceted: honours every OTHER filter), `groupRows` (largest first, or fixed order with empty groups for time / age). Time buckets `timeBuckets.ts`: auto grain day ≤ 31 days, week (Mon) ≤ 16 weeks, else month. Section builders: `moneyViews.ts` (`overviewAnalysis`, `moneyTrend`, `moneyInView` — collected / payments taken / customers paid / average, `moneyOutView`), `debtsView.ts` (filtered KPIs scope cash on debts by customer/kind/plan/branch; age buckets from `daysLate` today), `customersView.ts` (joined / left in period vs previous, active lines, **expected per month** = `resolveLinePrice` ÷ `durationMonths` at today's rate, cancelled + unpriced add nothing; joined/left trend), `salesView.ts` (sale-level groups use the **typed total**, item / line-type groups use line values — gotcha #142; "collected on sales" from sale cash, hidden under a staff/item filter), `staffView.ts` (per person: cash taken, payments, sales, sold, expenses). A picked day (time filter) drops "vs previous". Labels: Shared hook `useReportLabels` (ids → names, `NO_KEY` → "No plan"/"Unknown"…).

**Web UI** (`Web/src/modules/reports/`): `ReportsPage` (tabs, `PeriodPicker`, refresh, CSV of the section's rows via `sectionCsv`) → `AnalysisLayout`: `KpiGrid` (`StatCard` + vs-previous line) → `ReportFilters` (dropdowns + pinned chips) → "By X" `BreakdownTable` (group-by + time step, count, amount, share bar, CSV) → row ⋮ **Show records** (`RecordsDialog`, own CSV, adds to the group), **Only {row}, grouped by Y** (`drillInto`: pin the row as a filter, group by Y; Y = `splitTargets`), **Open customer**. Overview = KPIs + money-over-time `TrendTable` + in / out tables + currency split; Customers adds joined/left trend + customer list dialog; Staff = one table per person.

Shared homes reused: `StatTile` → `src/shared/components/`, date helpers → `Shared/src/core/utils/dateRange.ts`, wallet per-currency fold → `groupByCurrency` (`Shared/src/core/utils/currency.ts`).

### Release

**Not OTA**: `expo-file-system` + `expo-sharing` change the native fingerprint → `npm run build-prod` + reinstall. Range reads scan indexed `collections (tenant_id, received_at)`. Read-only, no schema change.

---

## Expenses

Money **out**, so the dashboard answers "did I actually make money?". **Admin-only end to end** (table RLS; UI hides segment, quick action, dashboard tiles) — rent/salaries aren't staff business.

**Two sources, one view.** `ExpenseService.getExpensesView({ startIso, endExclusiveIso, branchFilter })` → `ExpenseItem[]` + USD `ExpenseSummary` (shape of `LedgerService`: stored + derived stream):

|Source|From|
|-|-|
|`manual`|hand-typed `expenses` rows (rent, salaries, fuel, …)|
|`stock`|**derived** from `stock_movements` — costed, non-voided, non-`'sale'`; `amount = quantity_delta × unit_cost` (negative row = money back, older data only)|

**Restock never writes an expense row** → gotcha #89. Derived row **can't be voided** (`ExpenseItem.canVoid` false; 3-dot "Open product") — fix via **Edit entry** / **Revert entry**, entry's own month (Stock → cost, gotchas #94 / #96). Ids prefixed `exp:` / `stock:` (no collision).

**Credits print `+`, green**: `outflowLabel()` (card, total-spent headline, month totals) flips `−` to `+` over abs value (else `−-$5.00`); label `Water ×2 returned`, not `×-2`.

**Cash basis**: counts the month **paid for** — no FIFO / cost layering, unsold stock = inventory. Manual rows key off **user-picked** `incurred_at` (last month's rent typed today = last month), not `created_at`.

**`expenses` table** — `branch_id` (**own**, `NULL` = company-wide), `category` (free text; app owns code list, no migration for new ones), `description`, `amount` + `currency_id` + `rate_per_usd_snapshot`, `recorded_by_user_id`, `incurred_at`, soft-void. **Void-only, no edit** (typo = void + re-enter) → **not audited** (like debt tables). No tier gating.

**Branch: `owned` on both halves** → gotcha #88. NULL `expenses.branch_id` → **All branches** view only ("Unassigned" chip reaches it). Derived half via parent product: `stock_movements: { kind: 'inherited', joinedTable: 'products' }`, narrower than stock RLS. Branch views must sum to tenant total; never `shared` (double count). RLS wider on purpose (visibility ≠ aggregation).

**UI.** **Expenses** segment in Transactions hub (admin) + "Add expense" quick action; web `/expenses` page. Module store `expenseStore` reads a **date window** (`period: ReportPeriod`, this month default), no pagination → totals = local sum; open re-reads only when branch or `products.stockVersion` moved (`ensureExpenses`, `ReadStamp` — a restock moves the derived half). Rules ONE Shared place, both apps: `useExpensesList(search)` (`ensureExpenses` on open + branch change, `expenseListView`: filtered view sums its own rows at frozen rates, stock/other split only for whole window, `remove` = confirm + void), `expenseMenuItems` (`product` stock row w/ product, `remove` typed row), `EXPENSE_SOURCE_TONE`, `outflowLabel`/`outflowPair` (unsigned — credit is negative in data). Form = Shared `useExpenseForm` + `expenseForm.ts` (category — 22 codes in `expenseCategories.ts` + derived `stock`, searchable picker both apps (phone `Dropdown searchable`, web `Autocomplete`); new code = type union + list + en/ar label + phone/web icon map, no SQL (free-text column), `CurrencyInput`, day capped at today stored at local midday, branch = user's own else company-wide — not `defaultNewBranchId`, description); phone `ExpenseFormSheet`, web `ExpenseFormDialog`. Tests `tests/suites/expenses.test.ts`.

**Dashboard.** `DashboardMetrics` + `monthlyExpenses` / `stockExpenses` / `customExpenses` / `netIncome`. **`monthlyRevenue` stays GROSS** (`netIncome` = subtraction; `prevMonthRevenue` + pill keep meaning). Hero: orange `Expenses $X` chip (unsigned, like `outflowLabel()`) beside red "Owed by customers −$X" (spent vs not yet collected), `Net this month` line (red if negative); two full-width tiles. Admin gate = wallet's `viewer` in `getMetrics`.

**Code map:** `Shared/src/modules/transaction/expenses/` (repository, service, `state/expenseStore.ts`, `hooks/useExpensesList.ts` + `useExpenseForm.ts`, `utils/expenseCategories.ts` + `expenseList.ts` + `expenseForm.ts` + `outflow.ts`), phone `SubsTrack/src/modules/transaction/expenses/` (panel/card/form), web `Web/src/modules/transaction/expenses/`, `stockCostsInRange` on `IProductRepository`. Gotchas #88, #89, #94, #175.

---


## WhatsApp Cloud API (reminders and notices)

Each tenant connects its **own** WhatsApp Business number (Embedded Signup, web page `/whatsapp-connect`); Meta bills the tenant directly. SaaS owner enables it per tenant in SuperAdmin.

- **Where:** customer row menu → Send payment reminder / Send WhatsApp message / Stop · Allow WhatsApp messages; customer list multi-select → Send on WhatsApp; customer detail header icon.
- **Screens:** Admin → WhatsApp (org-wide admins only: connection, language, templates) + WhatsApp messages (history w/ status + failure reason).
- **Messages:** Sijil submits 4 UTILITY templates (en + ar): payment reminder (amount, months, due-since from ledger — only bills already due, never a prepaid future month), service outage, service back, general notice (free text). Tenant's own approved templates offered too.
- **Background:** queued + background-processed, retries, Meta daily limit, idempotent webhooks. Opt-out (STOP reply or admin) also cancels that number's waiting messages; account problem (e.g. no payment method) keeps them waiting until **Check again**.
- **Not connected:** single reminder opens `wa.me` w/ same wording.

Full design, Meta setup, tenant steps: `docs/whatsapp.md`.

## WhatsApp Invoices

Staff send the customer a **plain-text receipt over WhatsApp** — when money is taken, or later from the saved record. Pure `wa.me` deep link: no PDF, no printing, no new dependency, no DB change, no server work. All in `src/modules/invoicing/`.

**Module (4 files).**

- `utils/invoiceText.ts` — **pure** builders, no React/i18n singleton: `t` comes in `InvoiceContext { t, orgName, locale, currencies, displayCurrencyId }` (like `blockRangeLabel.ts`). `buildPaymentInvoiceText(ctx, customerName, rows)`, `buildSaleInvoiceText(ctx, sale, customerName)`, `buildSalesInvoiceText(ctx, sales, customerName)` (one row → single-sale layout, same document). **Not a Service** (decides/validates/throws nothing). Not in `src/core/` only b/c it reuses `getBlockRangeLabel` (Core may not import a module).
- `utils/invoiceRecipient.ts` — pure: multi-row receipt → the ONE customer, or why not (`mixed` / `no_customer` / `no_phone`); callers map rows to `InvoiceRecipientRow { customerId, customerName, phone }`.
- `hooks/useSendInvoice.ts` — only place a saved record becomes a message: context from `useAuthSlice` (tenant name), `useCurrencySlice`, `useDisplayCurrencyId`, `useLanguageStore`, `useTranslation`; calls `openWhatsApp`, on `false` shows `confirm({ hideCancel: true })`. Returns `{ canSend, sendBillInvoice, sendCollectionInvoice, sendSales }`; `sendSales` = Shared `useSalesInvoiceSend(openChat)` (drops voided, `resolveInvoiceRecipient` + refusal dialog), web runs the same hook with `openWhatsAppAfterSave`.
- `components/SendOnWhatsAppButton.tsx` — the single green (`bg-[#25D366]` + `logo-whatsapp`) action row; `Button`'s geometry, own component b/c `Button` takes no icon/`className`; `ContactToUpgradeButton` uses it.

**Entry points.**

- `CollectSheet` (via each surface's own send flag): the hand-over it writes → one receipt.
- `SaleFormSheet`: second stacked button **Save & send on WhatsApp**, using the `Sale` `createSale` returns.
- Quick pay — month-cell menu (`CustomerPaymentPanel`) + customer-card menu (`CustomerListScreen`): **Pay & send on WhatsApp** row beside "Quick pay".
- Month-grid multi-select (`InlineSelectionToolbar`): green WhatsApp action beside "Collect" — one receipt for its hand-over.
- `BillSheet` / money-in history row menu: **Send on WhatsApp**, re-send a saved hand-over any time.
- `SaleDetailSheet` + the three sales lists: **Send invoice on WhatsApp** — one sale, or one receipt for a selection.

Stacked, not side-by-side: `Button` takes no `className`; long label (+ Arabic) truncates at half phone width.

**Busy = one marker, not two flags.** Each form's `busyOn: "save" | "send" | null` is set **before** the write, cleared in `finally` → spinner stays on the pressed button through store write + awaited deep link. So `canSubmit` / `submitDisabled` are **validity-only** (adding the slice loading flag greys both buttons; a disabled `SendOnWhatsAppButton` shows no spinner).

**No phone → visible but disabled w/ caption.** Shared `canSendWhatsApp` (`core/utils/whatsappLink.ts`) digit-strips like `whatsAppChatUrl` (`"-"`/`"n/a"` disables, no broken link) — every app check + `WhatsAppService.buildRecipients` use it. Caption = Shared `sendBlockedKey(recipient)`: `invoice.no_customer` (walk-in) else `invoice.no_phone`; recipient = `ContactRecipient` via `customerRecipient`/`saleRecipient`; menu rows use `ActionMenuItem.caption`. **Voided hand-over or sale never shows the button.**

**A receipt is ONE hand-over** (`buildCollectionInvoiceText`, replaced the multi-row payment builder): one currency → one amount, one date, one customer (no mixed refusal). One settled bill is named above the amount; several = bullets under **"This pays"**, oldest bill first.

**Message format** (owned by `invoiceText.ts`): `*Org name*` bold header + receipt title, `Label: value` lines, list rows prefixed w/ literal `•`, `invoice.thank_you` footer. Amounts = `formatMoney(v, source, source)`, `source = snapshotCurrency(row, currencies)` — literal cash at the row's frozen rate — with ` (≈ …)` display-currency suffix on the **one** headline amount only. Date uses `getDateLocale(language)`, always `en-US`: `formatMoney` hardcodes Latin digits, so an `"ar"` date would mix numeral systems.

**Multi-plan / multi-month collection = one message** (one row). `CustomerListScreen` "collect all due" groups a customer's lines **by currency**, one collection per group, so a two-currency customer gets two receipts — correct (two piles of cash).

**Several sales still use the multi-row builder**: `buildSalesInvoiceText` keeps oldest-first sort, per-currency totals and `resolveRecipient`'s mixed-selection refusal (a selection is unrelated records).

**Created record:** `ledger.collect` returns the created `Collection` (no new state field) — header, split, id.

Gotchas #68, #69, #80.

---

## Transactions Hub

Bottom **Transactions** tab (`app/(app)/(tabs)/transactions`) hosts segments via shared `SegmentedTabs`: **Debts** (default), **Sales**, admins also **Expenses**. `TransactionsScreen` owns chrome (SafeAreaView + title + `BranchSelector` + segments); each **panel** owns its body (filters, list, sheets, multi-select). Shared `SelectionBar` (panels have no `PageHeader`; `PageHeader` reuses it, re-exports `SelectionAction`) **replaces the panel's filter row** in selection mode.

- **Debts** → `DebtsPanel` (see The Ledger — `ledger` slice).
- **Sales** → `SalesPanel` (former `SalesListScreen` body — `sales` slice).
- **Expenses** → `ExpensesPanel` (see Expenses — `expenses` slice). **Admin-only**: segment dropped from the array for non-admins, matching table RLS.

> **No Services segment** — a service is a **line on a sale**, so Sales already lists them; the price list is Admin → Services. See Products & One-Off Sales → Services.

> **Money-in history is a sheet, not a tab.** `CollectionsPanel` lives in full-height `CollectionsHistorySheet`, launched from the PageHeader 3-dot quick-actions menu ("Money received", first item) on any screen, via the `ui`-slice / `QuickActionSheets` seam. **One** list: month, sale and custom fee are all settled by the same `collections` row.
>
> **Voided hand-overs STAY, marked** (history = what happened): read passes `includeVoided: true`, `voidCollections` **merges** voided rows back into `items`. Money never counts one: `monthlyTotals` excludes voided server-side, panel per-row sum returns 0 for them. Month grid untouched (keys off collected money).

**Month-grouped lists.** Sales + Payments = `SectionList` by calendar month, newest first ("This Month" = `common.current_month`, else "June 2026" from `months_long`), preceded by **Today** (`common.today`) and **This Week** (`common.this_week`, Monday start, excl. today); each row in exactly one bucket. `groupByMonth` (`Shared/src/shared/lib/monthSections.ts`) is a pure view transform over **already date-desc-sorted** slice data — buckets, never re-sorts. Day/week totals summed locally (newest rows always loaded); a month that lost rows to Today/This Week subtracts that USD from its `totalsByMonth` total. Row date: Sales `soldAt`, money received `receivedAt`. Debts = flat debtors list, no sections. Shared `MonthSectionHeader`, sticky headers off; selection / select-all use the flat slice array.

- **Month totals.** `getAmountUsd` row→USD fn → each section's `totalUsd`, rendered (display currency) at the header's trailing edge by row count. Sales = **value sold** (`totalAmount`); money-in = **cash received** (`amount / ratePerUsdSnapshot`). Debtor detail modal groups debts/payments via shared `DebtList`.
  - **Paginated (`PAGE_SIZE` = 30) → loaded-row sums under-count.** 5th arg `totalsByMonth: Record<"YYYY-MM", number>` overrides the local sum per key present. From `saleSlice`/`collections` `monthlyTotals`, refetched w/ the page on each filter change (`SaleService.getMonthlyTotals` / `CollectionService.getMonthlyTotals`), **patched after a write** by `addMonthTotal(totals, iso, deltaUsd)` (a month absent from the map is left alone). `SaleRepository.monthlyTotals` / `CollectionRepository.monthlyTotals` = **`findAll`'s filters, unpaginated, 2–3 numeric columns** (joins only for search/branch); Supabase reads past the 1000-row cap via `BaseRepository.readEveryRow` (gotcha #175). `fetchMoreSales`/`fetchMoreCollections` do **not** refetch it. Debts unpaginated → sums locally.

**Money received (tenant-wide):** `CollectionsPanel` = every hand-over, all customers, newest first, default **this month**. `collections` slice + `CollectionRepository.find` + `CollectionService.getHistory` → `CollectionListItem` (header, split, customer name + phone, shared `kind` or `'mixed'`). Branch scope = collection's **own** `branch_id` (gotcha #103). `payments` slice + month grid untouched. Multi-select → bulk void via global `ledger.voidCollections` (one `voidMany`), then the list store marks its rows. Filters (period, collector, type, status, sort) = ONE Shared shape `ledger/utils/collectionFilters.ts` (`collectionFindOptions`, `hasCollectionFilter`), shared w/ web. Web Money received page: `ICollectionRepository.findPage` → `CollectionService.getHistoryPage` (docs/ui-patterns.md → Money received).

**Card: who paid, how much, what it paid, who holds the cash.** Line 1 customer name (bold, left) + amount (bold, right); line 2 **names the bills** (`collectionLabel`: first two labels, then `+N more`; never a bare "3 items"); line 3 collector + arrival to the **minute** (`formatDateTime`). Kind shown by **icon colour** + **kind chip** word (Month / Sale / Custom / Mixed), both from one `KIND_STYLE` row: month + sale emerald (receipt glyph parts them), manual violet, mixed indigo. **Never delete the chip** (glyph alone too quiet) — **tint it per kind** (one emerald badge everywhere = green wall). Other chips only as exceptions: `N items`; **holder** (amber, only when custody moved); red `Voided` + reason under struck-through amount. **Amount in the currency physically handed over** (`formatMoneyPair`, gotcha #128), small `≈` display line only when different.

**Chrome:** `PeriodPicker` (same as Reports; window is a visible chip, not a silent default), chips **Customer**, **Collected by**, **Type**, **Status** (not voided / voided only), **Sort by** (Received date / Recorded date / Last updated), **Order** (newest / oldest), then one **summary bar** "Collected in this view" summing the slice's unpaginated `monthlyTotals` (every matching row, not the loaded page). **Type filters on frozen `collections.kind`** (gotcha #128); status → `includeVoided` / `voidedOnly`, sort → `sortField` + `sortDirection`, all four server-side in both repos so paging stays correct. **Sort offers only dates the hand-over owns** — no due date (belongs to possibly several bills), no amount (cross-currency needs an expression) → gotcha #129. Received ≠ recorded: received is user-picked, can be back-dated.

**Row tap opens what it settled**: single bill → the bill; several → `CollectionDetailSheet` ("Payment details"); **voided → always the detail sheet** (its bill is owed again; sheet answers who cancelled, when, why). Voided view: **kind** pill + red **Voided** pill, void time, **author** (`voidedBy` on `CollectionListItem`, patched by `applyVoided` so it is instant), reason, bills headed **"This had paid"** w/ caption _these bills are owed again_, **no custody row** (holds no cash). Sheet content: total (+ `≈`), status pill, `InfoRows` (customer · received to the minute · who took it · where cash is now or "Banked" · **notes** · void time + reason), one `CollectionItemCard` per bill (**bill's** total, due date, billing instant). Bill card shows **no** remaining balance (spans every hand-over → `BillSheet`). `BillSheet`: customer, month billed, bill total, due date, billed-at to the minute, who billed it, notes; all in the **bill's own currency** (hero, remaining, payment rows) + one `≈` line under the hero.

---

## The Ledger (charges + collections)

All money lives in three tables, replacing `payments` / `custom_debts` / `debt_payments`: `payments.amount_paid` / `sales.amount_paid` held **one number and one date**, so 12 now + 8 next month left nowhere for the 8 (raise → revenue on the wrong date; leave → owed forever); `debt_payments` pointed only at a _customer_; debt was customer-level `Σ categories − Σ payments`, so no line balance was trustworthy.

### The model

|Table|Role|One row =|
|-|-|-|
|`charges`|what is owed — **the bill**|a month, a sale, or a hand-typed fee|
|`collections`|money physically handed over|one hand-over: "$55, 5 Mar, taken by Sami"|
|`collection_items`|which bill that money paid|one bill touched by that hand-over|

Bill ↔ payment is many-to-many (hence the middle table). Partial payments, installments, pay-later sales, oldest-first collection fall out free; wallet, dashboard, Reports each have a single source.

```
balance(charge)  = charge.amount − Σ collection_items (of non-voided collections)
debt(customer)   = Σ balance where balance > 0 AND (kind <> 'month' OR paid > 0)
owed(customer)   = debt items + unpaid months from buildMonthGrid, deduped on
                   (customer_plan_id, billing_month) — the charge row WINS
revenue(period)  = Σ collection_items in the period, by collections.received_at
wallet(user)     = Σ collections where held_by_user_id = user, per currency
```

**Nothing asks "does a charge row exist?" — everything asks "how much money came in?"** A month bill at 0 collected (after a void) reads _identically_ to no row; miss this → a voided payment leaves a ghost debt.

### Balance is never a column

`charge_balances` = `security_invoker` view (`product_stock` precedent); offline same `GROUP BY` over the mirror, one mapper for both. Two devices can collect offline without clobbering a counter.

> **The view's `CASE` is load-bearing.** `p.voided_at IS NULL` sits in a LEFT JOIN's `ON`, which does not _drop_ an item of a voided collection — only makes the joined row all-NULL. Bare `SUM(i.amount)` keeps counting voided cash, and voiding a payment never gives the balance back.

### The waterfall

`ledger/utils/waterfall.ts` pure — no I/O, no clock. `allocate(amount, items)` spreads money **oldest due date first, filling each bill completely**. Never proportional.

Sort has **four levels**:

1. `dueDate` — when it HAD to be paid; never the typed date, or a fee back-dated to 2020 jumps the queue (gotcha #74 in a new place).
2. `issuedAt` — a January month billed today loses to one billed last week.
3. `createdAt`
4. `keyOf(item)` — total order, so preview and save never disagree and two devices split identically.

Leftover = **overpay** → service refuses (nowhere for unapplied cash to live).

#### The order is SHOWN, not just applied

- **`CollectSheet` re-sorts its pool** w/ `sortByDue` before rendering, never trusting caller order (Debts passes `[...items, ...unpaidMonths]`, and `buildDebtsView` sorts on `dueDate` alone vs `allocate`'s four levels → rows could disagree with the money).
- **`AllocationPreview`** (`ledger/components/AllocationPreview.tsx`): row **queue number** (1, 2, 3…), **due date**, **days late**; number **filled** once money reaches it, **hollow outline** while waiting.
- **Unticking re-numbers rows below**; skipped row greyed, label struck, `×` badge.
- Row nothing reached prints **what it still needs** ("Not covered" alone doesn't).

Section header caption names the rule (`ledger.waterfall_hint`); `daysLate()` in `core/utils/date.ts` — one copy, shared w/ `ChargeService` and `DebtItemCard`.

### Virtual months

A month has **no charge row until money reaches it**. `LedgerService.getOwed` merges stored bills + unpaid months from `buildMonthGrid`, deduped on `(customer_plan_id, billing_month)`, **PAID stored bill wins**. Miss the dedupe → an empty month charge left by a voided collection counts twice.

An **EMPTY** stored bill deliberately LOSES (must read like a never-touched month, price included) → virtual month wins w/ the line's CURRENT price. Grid branches the same in `monthItemFromEntry` (`entry.collected > 0`, not `entry.charge`); both `CollectionRepository.create` paths re-price the stored row before collecting (else sheet shows new price, bills old). A bill money reached keeps its frozen amount. Gotcha #106b.

`CollectionService.collect` materializes the bill in the same write, id `deterministicId(customer_plan_id, billing_month)` → two offline devices converge on ONE row.

### A line with no set price

Custom-price plan or no plan → `resolveLinePrice` returns `kind: 'typed'`, **`getOwed` skips the line**. Month cell still collects via an **open item** (`OpenItem.openAmount`; amount / balance / currency empty); collect sheet adds **Amount for this month** — that field IS the bill and picks the currency.

- **Single item only** (two open months = two unknown amounts): grid multi-select containing one is refused w/ a message; quick pay w/ one price-less line opens the sheet on the customer list, two → month grid.
- **Once typed it is an ordinary bill** (`billedOpenItem` in `CollectSheet`): part payment ("Owed 50, paid 20"), "leaves N owing", overpay refusal = existing code.
- **Bill raised at the typed amount**, hand-over's currency: `CollectionService.materialize` uses `item.amount > 0 ? item.amount : line.amount`.

Afterwards the line is normal — remainder is a debt (Debts screen + waterfall). Gotcha #112.

### Owed vs debt

|Term|includes|consumed by|
|-|-|-|
|**OWED**|everything w/ a balance, plain unpaid months included|the waterfall, and only the waterfall|
|**DEBT**|partly-paid months, open/partly-paid sales, hand-typed fees|the Debts screen|

`isDebtItem(kind, paid) = kind !== 'month' || paid > 0` — one function, `ledger/utils/debtRule.ts`. **A fully unpaid month is NOT a debt** (it is `unpaid`/`overdue` in the month grid, own screen/workflow); becomes one once _partly_ paid.

**Debts screen never lists a plain unpaid month — structural, not a filter**: `getDebtsView` reads **stored bills only** (no virtual pass — do not add one). So `unpaidMonths` stays **empty** (partly-paid month → `items`; unpaid has no bill); both apps still pour Collect over `debtorOwedItems` (debts + `unpaidMonths`). Only leak = an **empty** bill (paid then voided, `paid = 0`) showing a lone month while real unpaid months stayed hidden → `buildDebtsView` drops `kind === 'month' && paid <= 0` (gotchas #106, #106c).

**Custom debt form — one set of rules, both apps.** `useCustomDebtForm` (+ pure `customDebtForm.ts`) owns draft, locked customer (an edit, or caller passes one), currency lock once money landed, below-collected floor, Save rule, branch (customer's, else user's). Edit sends currency + rate **only when currency moved**, so a part-paid bill keeps its frozen rate (gotcha #181). Edit/Remove only on a LIVE custom debt (gotcha #182). Phone `CustomDebtFormSheet` and web `CustomDebtFormDialog` are views over it.

**Debt history paging.** `debtHistoryReadOptions(filters, branch)` = every history filter minus the window; phone store adds limit/offset → `getChargeHistory`; web table adds a `PageWindow` → `getChargeHistoryPage` → `IChargeRepository.findHistoryPage` (both impls; one query builder per impl shared w/ `findHistory`, so page and count cannot disagree).

### Void vs write-off

Kept mutually exclusive by `chk_charges_void_xor_write_off`:

|Action|means|effect|
|-|-|-|
|**void** (`voided_at`)|a MISTAKE — never existed|gone from every figure. `voidCharge` refused once money sits on it; `voidChargeWithPayments` = deliberate "take the cash with it" door (below)|
|**write off** (`written_off_at`)|REAL but will never be paid|leaves "still owed", reported as **loss** in Reports → Debts|

Voiding a **collection** is a third thing: cash was real but shouldn't have been recorded. Each touched bill gets its balance back on its own (balance = sum over live items).

**A dead bill still owns its month (`charges` unique on `(customer_plan_id, billing_month)`), so collecting REVIVES it**: `reviveTargetBill(s)` INDEPENDENTLY clears all six void/write-off columns unconditionally + re-prices an EMPTY month bill; re-price paid check sums `collection_items`; `charge_balances` excludes **only** voided; "no longer owed" decided only in `ChargeRepository.find` → #115.

**A written-off bill stays REACHABLE; write-off is undoable** (hidden from the debts total, never from the debtor). Debts surfaces read via `FindChargesOptions.writeOffScope` (`'live'` default); debtor sheet + customer's Transactions panel have **Owed now / Written off** `PillTabs` (customer list's filter control), always present, default "Owed now". Written-off tab: greyed bills, orange chip, read fired in background on open so the tab never waits. SEPARATE read, **never folded into `DebtsView`** (debtor total, Debts headline, customer badge mean "still expected"). Written-off row: no **Collect**/**Write off**, only **Undo write-off** (`ChargeService.revertWriteOff` → `writeOffRevertPatch()`): clears the three write-off columns only, keeps `issued_at` + collected money. **NOT a revive** (revive re-stamps `issued_at`) → audit says "undid the write-off on …" vs "re-opened …". Written-off sale: same chip on card + receipt, amount grey not red. Gotcha #152.

### One currency per hand-over

A collection has one currency = currency of every charge it pays → `collection_items` has **no currency or rate**, so a balance closes at exactly zero, no rate drift. Two-currency customer is collected twice; collect sheet shows a currency picker. USD for revenue/wallet uses the **collection's** frozen rate (what arrived); USD for a debt total uses the **charge's** (what was billed).

### Screens

- `CollectSheet` — the ONE collect form; whole customer (type amount, waterfall splits, untick to steer) or single bill; same write → one code path, one audit shape.
- `BillSheet` — one bill: running `15 / 20 $` hero, then **every payment that reached it** (own date + collector).
- `BillPaymentsList` — those payments alone, per-row menu (send receipt / void this payment); shared w/ the **sale receipt** (same `charges` row).
- `CollectionCard` — one hand-over; single bill named inline, several = `3 items` marker; tap → the bill, or `CollectionDetailSheet` if several/voided.
- `CollectionDetailSheet` / `CollectionItemCard` — ONE hand-over in full ("Payment details": dates, collector, custody, void) + its bills, each card opening its bill. Paints from the list row, then re-reads so each bill is named w/ its plan or sale.
- `useOpenBill` — read-only "bill behind this row": month + manual fee → shared `BillSheet`; **sale** → receipt via injected `onOpenSale` (sales depends on ledger, **never the reverse**). `open(charge)` / `openOwed(item)` (`OpenItem`). **Neither reads**: an `OpenItem` from a stored bill carries its `Charge` (`openItemFromCharge`), like a `CollectionItem`; a sale needs only the row's `saleId`. **Virtual** month opens nothing.
- `CollectionsPanel` / `CollectionsHistorySheet` — money-in history, ONE list, from the quick-actions menu.
- `CollectQuickActionSheet` — "Collect money" from anywhere: pick customer, waterfall does the rest.
- `DebtsPanel` — one row per owing customer, **sorted by how far behind**.
- `DebtorDetailSheet` — two sections, **Debts** + muted **Unpaid months** (partly-paid months only; see Owed vs debt), plus one `Collect · N` button pouring money over both, oldest first.
- `DebtItemCard` — one owing bill, `CollectionCard`'s twin: label + balance, then **due** + **billed** dates, then chips. **Icon red on every row**, so the **kind chip** carries the tint: teal month + sale (the word parts them), violet custom, **never emerald** (= money arrived). Status chips must stand out: red **N days late**, amber **`10/20 $`** part-paid, orange **Written off**. Balance in the **bill's own currency**, `≈` line only when different (#128). Shared `Chip` (`shared/components/Chip.tsx`).
- Opening a debt row — **any debtor-sheet row opens its record** via `useOpenBill.openOwed` (month/fee → `BillSheet`, sale → receipt). `DebtsPanel` gets `onOpenSale` from `TransactionsScreen` (`useSaleDetailSheet`), so debts never depend on sales. Read-only: no collect / void-bill footer (row's 3-dot owns those). A payment void inside bumps `owedVersion`; sheet + list follow, no own patch.

**Split preview = heart of the collect sheet**: staff see what the money does BEFORE saving; untick any row to steer cash on. Whole-customer mode lists every owed currency at once, each w/ own amount box + oldest-first split; single-currency hand-over (gotcha #108) → ONE `collections` row per currency, amounts in each currency's own units, never converted; display-currency total is read-only.

**"Received on" = moment of SAVE unless staff picks a date.** Field shows sheet-open time, but untouched saves `new Date()` at Save (sheet may sit open minutes). A picked different value is saved; confirming the picker on the same value is not a pick.

### Where voiding lives — two doors, two statements

One hand-over can settle three months + a sale, so "void this month's payment" is ambiguous → two doors.

**Void one payment (narrow):** _that hand-over was wrong; bill still owed._ Only per payment row in `BillPaymentsList` (month bill sheet + sale receipt); row says _"also paid other bills"_ when wider. Everyday fix: mis-recorded cash, wrong customer/amount.

**Void the bill (wide):** _never should have been billed_, so its cash goes too. One primitive `ChargeService.voidChargeWithPayments`, three entry points:

|Where|Label|
|-|-|
|month cell 3-dot|**Void this month** (whenever the month has a bill — incl. an unpaid one still holding the bill a voided payment left)|
|`BillSheet` footer|**Void this month** (red, last — per-payment void above is the usual correction)|
|a sale's 3-dot / receipt|**Void sale** (`SaleService.voidSale`)|

- **Payments first, bill second**: a failed bill void leaves a recoverable _unpaid bill_; reverse order strands live cash on a nonexistent bill.
- **Always say the money goes — no number** (no ledger read entering the dialog); a hand-over that also settled other bills is voided **whole**, so voiding January can hand February back too, and the message says so.
- **`voidCharge` still refuses a paid bill** — keeps narrow paths (a debt row's void) from destroying cash.

**A MONTH bill is voided NEWEST-FIRST** (voiding July under paid August = "✓ Paid on top of Overdue", #79/#81): both month entry points go through `payments.voidMonthBill` → `PaymentService.billVoidOrderBlocker`, popup names the month to void first ("August 2026 is paid on this plan. Newer months must be voided first."). Lives in the **payment** slice (a sale has no month order). Whole bill = the write → multi-month block judged by every month it covers; a **partially**-paid later month still blocks. **Payment** void: no gate (bill stays owed). `voidSale` voids only the **payments**; `repository.voidSale` voids the sale's charge in its own transaction (one owner).

**One write, never a loop (performance).** `CollectionRepository.voidMany` = one UPDATE (offline one transaction). A `void()` loop = read + write + audit insert per row online, offline a transaction per row queued behind `withDbLock` (expo-sqlite = one connection); `CollectionService.voidCollections` has no loop either. Returns only rows actually voided; offline **un-hydrated** (`hydrate` = 3 more queries) — slice stamps the caller's `items` back (#119a).

**Never count payments to warn** ("{{count}} payments"): confirms state it unconditionally, so a void dialog costs zero reads; a count re-reads rows `voidChargeWithPayments` reads anyway (needs their ids).

### Where the sales-list rules live (both apps)

Phone Sales tab + web Sales page share `Shared/src/modules/transaction/sales/utils/saleFilters.ts` (`saleFindOptions` → repository options; `hasSaleFilter` = list narrowed?). Sale ⋮ rows = `saleMenuItems` in `saleView.ts` (History admin-only, like every audit read); void confirm names `saleVoidTarget` (live sales + their bills); receipt detail rows = `saleInfoRows`; void = `useVoidSales` (null keeps confirm open when nothing went). Web pages via `ISaleRepository.findPage` (both impls, ordered `sold_at, created_at, id` newest first); phone keeps `findAll` w/ infinite scroll. A month/period total NEVER counts a voided sale, even under "Live and voided" (gotcha #178); Supabase total reads past the 1000-row cap (#175).

### The sale writes its own bill

`SaleService.createSale` passes a `charge` w/ header, lines, stock movements → offline ONE transaction (no sale without its bill). Till cash then takes the **normal collect path** (custody, audit, currency rules in one place); if that fails the sale stands fully owed (safe). `Sale.amountPaid` is **derived** (`SaleService.withMoney`, from bill balance). Editing re-prices the bill, leaves collections untouched; form shows collected read-only, refuses a total below it.

### Code map

```
src/modules/ledger/
  repository/   IChargeRepository · ChargeRepository(.offline)
                ICollectionRepository · CollectionRepository(.offline)
  services/     ChargeService      — bills: raise / correct / void / write off
                CollectionService  — money: collect / void / history / custody
                LedgerService      — "what does this customer owe?" (both sources)
  utils/        waterfall.ts   — PURE allocation
                openItems.ts   — the debt rule + the OpenItem builders
                monthTotals.ts · mapper.ts
  components/   CollectSheet · BillSheet · CollectionCard · CollectionsHistorySheet
                CollectQuickActionSheet · VoidCollectionDialog · CollectionsVoidDialog
                AmountCollectedSection
  hooks/        useCollectSheet — the one way a list opens the collect sheet
Shared (both apps): hooks/useCollectForm (the sheet's state) · useCollectSubmit (one
                hand-over per currency; a half-saved Save closes, never retries) ·
                useLoadOwed · useCustomerOwed; utils/collectForm.ts (single bill, groups, inputs)
                useBillPayments (one bill's hand-overs, patched by a void / correction) ·
                useCorrectPayment · useCollectionDetail · useBillHistory · useWriteOffActions
                (write off / undo / write off all); utils/billView.ts (billFacts: which doors a
                bill opens · billHeadline · billInfoRows) · collectionView.ts · correction.ts
                (correctionPlan / correctionProblem / correctionReason)
Web:           Web/src/modules/ledger/collect/ — CollectDialog · useCollectDialog · CollectQuickActionDialog
               Web/src/modules/ledger/bill/ — BillDialog · BillPaymentsList · BillSummary
               Web/src/modules/ledger/payment/ — PaymentDetailDialog · CorrectPaymentDialog · paymentActionIcons
               Web/src/modules/ledger/void/ — VoidPaymentsDialog · VoidBillDialog · SharedBillsWarning
  screens/      CollectionsPanel
```

State: `ledger` slice (debts view, one customer's owed pool, collections, `netByCustomer`) + `collections` slice (paginated history). `payments` slice keeps only **month-grid** state — bills, skips, the three per-line derivations the UI gates on.

---

## Regular Customer

`Customer.isRegular` (default `true`) = subscription vs occasional.

|Behavior|Regular (`isRegular = true`)|Non-regular (`isRegular = false`)|
|-|-|-|
|Paid cell|Green|Yellow/Gold|
|Unpaid cell|Red|Light gray|
|Unpaid banner|Yes (current month, if unpaid)|No|
|In "unpaid" tab|Yes|No|
|Dashboard `unpaidThisMonth`|Counted|Excluded|

See gotcha #16.

---

## Skipped Months

Skipped month = month one service line is **not expected to pay** (free month, vacation, pause). Neither paid nor unpaid; reversible.

**`skipped_months`, one row per (line, month):** `tenant_id`, `customer_id`, `customer_plan_id`, `billing_month`, `skipped` (BOOLEAN), `note` (optional), `skipped_by_user_id`, timestamps. `UNIQUE(customer_plan_id, billing_month)` = deliberately same natural key as a month bill (`uq_charges_line_month`) → grain matches grid, offline derives a deterministic id.

- **Unskip flips `skipped` to `false`; row KEPT** — a deleted row carries nothing to other devices (pull = latest-`updated_at`-wins), so the toggle is the sync signal. Re-skip reuses the row. Store holds only **active** skips (`skipped = true`) — `SkippedMonthService.getSkipsForCustomer` / `getActiveSkips` filter server-side.
- **No money**: never creates/clears/touches a debt, payment or wallet.
- **Any user** may skip/unskip; `skipped_by_user_id` = who last set it.

**Grid.** `buildMonthGrid(line, payments, skips, year)`: `before_start` → `paid` → **`skipped`** → `future` → `unpaid`. **Money wins** — a skip on a later-paid month is inert, so the service need not guard skipping a paid month. Slate cell + "Skipped" sub-label, regular or not; `MonthEntry.skip` carries the note.

**Not payable — unskip first** (no "pay anyway" except a _locked_ skip):

- Tap skipped cell → **unskip** confirm (checked _before_ the inactive/cancelled gate; unskip isn't a payment).
- `?quickPay=1` deep link → `payments.skip.pay_blocked` instead of form.
- Other pay paths filter on `isPayableStatus` (`'unpaid' || 'future'` + locked skip): `canQuickPay`, `payableEntries`, `isPayable` in `monthSelection.ts`.
- Multi-month block covering a skip refused whole (`assertNoSkippedMonths` → `errors.months_skipped`) — consecutive block can't leave a hole.

**Unskip follows the VOID rule; a locked skip becomes payable** → full rule in gotcha #84 (fifth door of #79): `PaymentService.assertUnskippableInOrder(months, linePayments)` / `blockingPaidMonths` / `setMonthsSkipped` (when `skipped === false`), Unskip hidden + month payable, `assertNoSkippedMonths` exemption, list untouched (`notDueLineIds`), `errors.later_month_paid_unskip`. Extra: on a locked month Pay now / Pay & send appear for a fixed-price plan, and the payment form shows amber `payments.skip.locked_pay_notice`.

**Nothing owed → nothing counts it:**

- `monthStatus.buildCustomerStatus` (all list data, off `buildMonthGrid`): skipped never resolves `unpaid`, can't make overdue; **not a required month** → never in "N/M plans paid", never blocks "paid" (paid thru Feb + March skipped = settled). `status` = `"skipped"` when owes nothing **and** no line owes this month b/c of a skip.
- `CustomerRepository.countUnpaidForMonth` (web + offline): dashboard `unpaidThisMonth` and sibling `dueThisMonth` both skip those lines → skipped customer in neither half of collection-progress bar.

**List badge.** `status === "skipped"` = owes nothing **and** a skip on **every** started active line is why nothing is due. Slate **"Skipped"** pill; excluded from **Unpaid** tab. One skipped + one unpaid line → `"unpaid"`. Older unpaid month outranks it → **"Overdue"** (a skip excuses its own month, never a backlog).

**`CustomerStatus.notDueLineIds`** (ex-`coveredLineIds`) = must not quick-pay this month: covered by payment **or** skipped. Read per customer by `Shared/src/modules/customer/customers/utils/quickPay.ts` (`canQuickPay` / `currentMonthItems` / `fixedMonthItems`; phone list + web Customers) → "Collect all due" leaves skipped lines alone.

**UI.** `SkipMonthSheet` (a `ConfirmDialog`, like `VoidSheet`) both ways: skip takes optional note, unskip echoes it. Entry: cell 3-dot (**Skip month** on unpaid/future; **Unskip month** on skipped **unless a later month is paid**), tap on skipped cell, grid **multi-select** toolbar (_Skip_ + _Unskip_ together, each on its own subset). Skipped cell's selection unit = itself only (never in a payable block). Year card: **"N skipped"** chip beside paid/unpaid.

**Offline.** Synced tenant table (`db/tables.ts` + `PUSH_WAVES`, same wave as `charges`), local `UNIQUE (customer_plan_id, billing_month)`. Writes via `upsertNaturalKeyDirty` (generalized `upsertPaymentDirty`); id = `deterministicId('skip', customer_plan_id, billing_month)` — prefix avoids colliding w/ month bill id of same pair. Push conflict target = natural key (`conflictTarget` in `sync/push.ts`) → devices converge.

---

## Customer Map Location

Optional `Customer.locationUrl` (`customers.location_url`) so a collector can navigate home.

- **Capture.** `CustomerFormSheet.tsx` "Location on map": **Open Google Maps** (`openMapsApp()`, `src/shared/lib/maps.ts`) + numbered steps + field for the share link. Stored **raw**, deliberately **no** coordinate parsing — Maps "Share" usually gives a short `maps.app.goo.gl` link w/ no coordinates (needs network to expand).
- **Use.** If set, `CustomerDetailsCard.tsx` **Open in Maps** row → `openLocation(url)` → `Linking.openURL` (Shared `locationHref()` in `core/utils/locationLink.ts` prepends `https://` if no scheme; web Details panel opens same href in new tab). Maps app resolves short links + directions. No map lib, no API key, no native rebuild — same pattern as `openWhatsApp` (`src/shared/lib/whatsapp.ts`).

---

## Multiple Plans per Customer (service lines)

Several plans at once (e.g. internet + IPTV), each paid independently:

- **`customers`** — account (name, phone, branch, `is_regular`, `active`). No `plan_id`.
- **`customer_plans`** (**service line**) — own `start_date`, `cancelled_at`, `active`, optional `custom_price` + `custom_currency_id` (**special price**). `plan_id` NULL = custom/occasional line.
- **`charges`** month bills → `customer_plan_id`; `UNIQUE(customer_plan_id, billing_month)` → each line billed/paid separately. `plan_id` = price snapshot.

**Layers.** `customer-plans` module (repository/service/mapper) mirrors `plans`. `customerPlans` slice: `syncLines(customer, lines, removed, reactivated, tenantId)` (customer as saved, so gates see real lines; applies form's Plans editor) + `hasPayments(lineId)` (drives remove prompt). `removed` = `RemovedLine[]` (`{ id, hardDelete }`); `reactivated` = `string[]` of cancelled ids revived (also active drafts in `lines` → upsert path, update also flips `active`/`cancelled_at`). `CustomerPlanService.syncLines`: removals + create/updates **concurrent**; **skips kept lines w/ unchanged plan + start date** (never a reactivation); **returns** `{ active, cancelled }` (`active` incl. reactivated). Slice rebuilds `customerPlans` **locally** via `customers.setCustomerLines` (active result + soft-cancelled removals + old cancelled lines for history, minus reactivated/hard-deleted) — **no `fetchCustomer`** → one round-trip when plans unchanged (customer update already returns fresh lines).

**Managing plans = customer form only** (phone `CustomerFormSheet`, web `CustomerFormDialog`, both on Shared `useCustomerForm` + `useLineDrafts` + pure `customer-plans/utils/lineDrafts.ts`; create AND edit). Save after a refused line on a NEW customer edits the one already created, never a second copy. "Plans" rows = **plan dropdown + start-date picker + delete, one line**; "Add plan"; min one _active_ row (plan-less row = custom amounts). Line start date is the **only** start date (`customers` has no `start_date`; customer starts w/ first line). New customer's first row = today; added row inherits previous row's date. Save → create/update customer, then `syncLines`. **Remove** = hard-delete if no payments, else prompt below. **Cancelled lines stay visible** (dimmed, read-only, "Cancelled" badge, **Reactivate**). ≥1 active line always.

**Remove w/ payments.** Trash on existing active line → `hasPayments(lineId)`; if any → confirm w/ checkbox (`RemovePlanChoice`) _"Delete permanently"_. Unchecked (default) → **soft-cancel** (`active = false`), payments untouched, row stays reactivatable. Checked → `CustomerPlanService.deleteLine(id, hardDelete=true)` → `repository.delete(id)` **hard-deletes line + cascades its payments** (FK `ON DELETE CASCADE`) — **intentional exception to rule #7**; copy warns irreversible. Back out = stays active. No payments → silent hard-delete. Checkbox rides in shared `confirm()` via `content?: () => ReactNode` — render callback kept **outside** immer state (like `pendingResolve`), read via `confirm.getContent()`; checkbox owns its state, reports via closure ref read after the promise settles.

**Reactivate.** Cancelled row → active + editable. Soft-cancelled _this session_ (still in `removed`) → both cancel out, no DB call. Else id → `reactivated`; on save it's a normal active draft (`getLines`) through `syncLines`' **single upsert path**: `CustomerPlanService.updateLine(id, draft, reactivate=true)` → `repository.update` w/ `active = true, cancelled_at = null` + plan/date in one write. **Never** a separate reactivation write — doing both double-listed the line in rebuilt `customerPlans` until next fetch. Payments untouched by soft-cancel → nothing to restore.

**Per-line special price.** `custom_price` + `custom_currency_id` (NULL = USD) **replaces** plan price for that line only (billed by quantity / private deal). Beats an `is_custom_price` plan (retype monthly, no quick pay) or a private catalog plan per customer (eats tier `maxPlans`).

- _Set:_ last control on each Plans row, **any** staff (no admin gate). **Collapsed** by default to effective price + "Special price" link ("Price: 10.00 USD per month" / "Amount typed each month" w/o plan price) — plan price is the overwhelming case. Link opens inline `CurrencyInput`; a row w/ a special price opens **expanded** (figure never hidden). Back link "Use plan price" (or "Clear" w/o plan price). Deliberately **no mode/radio state**: amount IS the state, so "special but empty" can't exist. `getLines` normalizes (no currency w/o amount). An amount makes a typed-monthly line one-tap-payable.
- _Read:_ never directly — pure **`resolveLinePrice(line)`** (`Shared/src/modules/customer/customer-plans/utils/linePrice.ts`) → `{ amount, currencyId, durationMonths, isFixed, kind }` (`kind`: `special` | `plan` | `typed`); single answer for payment form, all three quick-pay paths, grid price header, list "Collect all due" filter. `isFixed` (_amount remembered_) = quick-payable (replaced "has fixed-price plan"). Amount + `currencyId` travel together — currency freezes `rate_per_usd_snapshot` (gotcha #85).
- _Rules:_ **any plan length**; replaces price for plan's **own billing span** — 3-month plan = "100 **per 3 months**", never 100 × 3. So `resolveLinePrice` returns the **plan's** `durationMonths`, and labels name the span (`subscriptions.per_month` / `per_n_months` → `price_is_per`, expanded label `price_special_per`), else a bundle price reads monthly and under-charges. Only check: `CustomerPlanService.assertCustomPricesAllowed`, pure (`errors.custom_price_positive`). **Not frozen once paid** (unlike `start_date`, whose lock guards the grid; `buildMonthGrid` reads no price) → affects only **next** collection; payments keep `amount_due` snapshot; audit trail (`customer_plans`, both platforms) logs it. `custom_currency_id` `ON DELETE RESTRICT` → counted in `CurrencyService` refs, so a currency used only by a special price soft-deletes.

**Month grid.** `monthStatus.buildMonthGrid(customerPlan, payments, skips, year)` = **one grid per line** (payments pre-scoped, boundary `line.startDate`); slice keeps `monthGridsByLine` by line id (rule #1).

**Customer detail.** `CustomerPaymentPanel` **line selector** tabs above year card, one grid at a time; single-line → auto-selected, selector hidden. Cancelled lines visible (dimmed). Selector view-only (no add/edit/remove). Pay/void pass selected `line.id` as `customerPlanId`. Tab **status dot** from viewed-year grid (`gridSummary.lineIndicator`, worst-wins unpaid=red > paid=green; partial = paid; no dot if nothing due) — off `monthGridsByLine`, re-derives per year, matches grid/chip colors.

**Cancelled plan / inactive customer.** Line **payable up to and incl. its CANCEL month** (form, quick-pay, bulk-pay); later blocked by "Not available" (`payments.cancelled_plan_month_blocked`, or `payments.inactive_month_blocked` — inactive customer wins; both name last billable month). One gate in `CustomerPaymentPanel`: `isPayBlocked(entry) = isAfterMonth(entry, payLimit)`, `payLimit = lastBillableMonth(customer, selectedLine)` (`Shared/src/modules/customer/customer-payments/utils/payWindow.ts`), used by `handleCellPress`, `canQuickPay`, `payableEntries` → all agree. Limit = **earliest** of customer/line `cancelledAt`; falls back to **current month** if nothing stopped or inactive row lacks a stamp (live line: only calendar-future blocked; missing stamp never blocks more). Cancel month payable b/c served part of it. Later months still paint **unpaid**; only money door shut. Collect sheet only opens via this gate.

**Aggregation** over **active** lines, `monthStatus.buildCustomerStatus` only (see CLAUDE.md → Customer-List Status): `"paid"` only when **every** line owes nothing over **all** required months, start → today (**partial** = covered; remainder is debt). Separate `overdue` flag (own red pill) when an active line has an _earlier_ unpaid month — **except** last month before the `customer_start_day` billing day: owed (red cell, red "Unpaid" pill), not _late_ → no "Overdue" (gotcha #83). "Paid" = owes nothing → **never beside "Overdue"** (gotcha #56b). **Not required** (treated as nonexistent): skipped month, month before line start, current month before billing day under `customer_start_day`; owes nothing + nothing due → "Skipped" / "Not due yet", not unpaid. Default `month_start`: **no grace** — current month unpaid from day 1 on card and grid alike (gotcha #34).

**List filters (phone + web).** ONE sideways-scrolling dropdown row (phone: chip dropdowns in `FilterChipsRow` via filter button; web: `FilterSelect`s in `FilterBar` above table): **Status** (Active default / Inactive / All customers) · **Payment status** · **Debts** (has/none) · **Unpaid months** (1+/2+/3+/6+, `CustomerStatus.unpaidMonths`, = reports' aging count) · **Plan** (ACTIVE line on it) · **Customer type** (regular/occasional) · **Last paid from / to** (newest live hand-over of any kind within those whole local days; never-paid outside any range) · **Phone number** (has/none; blank = none) · **Portal access** (on/off) · **Clear filters**. AND. Web-only **Sort by**: name, highest debt, most unpaid months, longest since last payment (never paid first), newest — phone holds list page by page. Search = name, phone, address, area. One rule `matchesCustomerFilters` (`customers/utils/customerFilters.ts`): phone over loaded rows (last paid: `useLastPaidStore` → `ICollectionRepository.lastReceivedByCustomer`), web's `customer-status` over all customers.

**Payment status = card pills.** Five options = five flags of `customerFlags(status)` (`customers/utils/customerFlags.ts`); card maps that list, filter does `.includes(activeTab)` → tab = exactly customers showing that pill (two pills → both tabs).
- **Unpaid** = collectable now (every due plan unpaid this month **and** no earlier unpaid); an **overdue** customer can't pay current month until backlog clears (oldest-first, gotcha #77) → **Overdue** only, one "Overdue" pill not "Unpaid + Overdue". Under `customer_start_day` Unpaid may hold a customer whose current month isn't quick-payable (last month owed, not late, #83 — collect it first from grid).
- **Partly paid** = `mixed` (N/M plans); **only** pill that can share a card w/ "Overdue".
- **Paid** = every plan settled over required months (partial counts) → never overdue.
- **Not due yet** = owes nothing, no month due this month for a non-skip reason (no plan, not started, billing day not reached).
- All five active + regular only (inactive / non-regular have own pill). `skipped` has no tab. Status not computed → no tab (absence ≠ debt).

**"N/M plans paid".** **2+ in-play plans, some clear, some owing** → `status === "mixed"`, amber badge (**"1/2 plans paid"**) not red "Unpaid". `CustomerStatus.planCount { paid, total }`: `total` = lines that ever had a **required** month; `paid` = lines w/ **no unpaid required month ever** (plan behind on January never counts → "3/3 plans paid" can't sit by "Overdue"). Required = grid `paid`/`unpaid`; `before_start`, **skipped**, not-due-yet excluded both sides. **One** path `monthStatus.buildCustomerStatus` for bulk (`getCustomerStatuses`) and post-pay/void patch (`syncCustomerStatus`). Partial line counts as `paid` → single-plan partial reads green **paid**; remainder only on Debts tab.

**Quick-pay eligibility.** `notDueLineIds` = covering non-voided payment (full or partial) **or** skipped this month; a line merely _not due yet_ under `customer_start_day` is deliberately **absent** (early pay allowed). **`uncoveredLineIds`** = line has an **earlier** month w/ nothing collected, overdue or not (oldest-first, #83). Both per customer (no global `Set`), refreshed by `fetchCustomerStatuses`, patched by `syncCustomerStatus` after local pay/void. Quick pay skips them → mixed customer pays only still-due plans, never re-pays a line (payments `createMany` upsert would overwrite the row and reset its remittance). List void-this-month refreshes the whole map so freed lines become quick-payable.

**Collect all due.** List Quick Pay (single/bulk) collects **every eligible fixed-price line unpaid this month**, ONE hand-over per customer **per currency** (can't mix; USD + LBP = two rows). Filtered by `notDueLineIds` / `uncoveredLineIds`; custom-price / plan-less → detail screen.

**Card 3-dot labels** by started active lines this month: **single-plan** → **"Quick pay"** / **"Void current month"** (plain "Void Payment?" confirm); **multi-plan** → **"Quick pay unpaid plans"** / **"Void paid plans"** ("Void paid plans?" confirm: voids every plan paid this month + whole multi-month bundles). Quick pay shows while any started plan is unpaid → mixed shows **both**. Keys `payments.quick_pay.menu_label` / `payments.quick_pay.pay_unpaid_plans`, `payments.void_current_month` / `payments.void_paid_plans`.

See gotchas #1, #16, #25, #41.

---

## Pay Oldest Month First

Month **not payable while an earlier month of the same line is unpaid** (no paid March on unpaid January).

- "Unpaid" = grid `"unpaid"`. **Skipped** and **partial** (reads `paid`, remainder = debt) don't block. Future never resolves `unpaid` → settled line can prepay.
- **Whole write judged at once**: Jan+Feb+Mar together OK, March alone refused; multi-month block judged over all its months → block starting at first unpaid month passes.
- **All years** checked (previous-year backlog blocks though off-screen).
- **Stops at:** cell tap, cell "Pay now"/"Pay & send" (hidden), grid multi-select Collect, list quick pay (line dropped from "collect all due"), `?quickPay=1`. Names oldest month: _"January 2026 is still unpaid on this plan. Older months must be paid first."_
- Skip, amount edit, receipt view unaffected (rule = recording new money). **Void has a mirror rule.**

`blockingUnpaidMonths()` (`Shared/src/modules/customer/customer-payments/utils/payOrder.ts`) decides; UI reads it via slice `uncoveredMonthsByLine` (per line, all years) and `CustomerStatus.uncoveredLineIds` (list) before opening collect sheet. Gotcha #77.

### Void Newest Month First

Mirror (why the pay rule holds): **no void while a LATER month of the same line is paid**; voids run backwards (else voiding Jan w/ Feb paid recreates the forbidden state).

- **Blocks:** any later month w/ money than the earliest voided month; **partial** blocks (real money); zero-collected bill never; **all years** (Dec 2026 blocked by Jan 2027).
- **Whole void judged at once** — paid tail Jan+Feb OK, Jan alone refused; **multi-month block** judged over all months its payment covers, always voided whole.
- **Per line**, not customer (line B's Jan voids freely while line A has paid Feb).
- **Stops at:** receipt sheet Void, cell menu "Void payment" (kept **visible**, explains on press — never silently vanishes), grid multi-select Void, list "void current month", Transactions → Payments (service refuses, ErrorBanner). Names newest: _"February 2026 is paid on this plan. Newer months must be voided first."_
- `blockingPaidMonths()` (same file) decides; `PaymentService.assertVoidableInOrder` enforces in `voidPayment` / `voidPayments` / `voidCurrentMonth`, resolving rows from ids itself (covers every caller); UI reads slice `paidMonthsByLine`.

### Start Date Frozen Once Paid

Third door: line **start date locked once it holds a non-voided payment w/ money** (earlier invents unpaid months behind paid; later hides months w/ payment rows). Date input disabled, **explains on tap** ("Not available": _"Start date is locked — this plan already has payments."_) via `DatePickerInput` `disabledReason` (greyed w/o reason looks like a bug; a permanent caption costs height per line; **cancelled** row passes no reason — whole row read-only). `CustomerPlanService.syncLines` refuses regardless (only for changed dates). All payments voided → editable. Probe `findPaidLineIds(customerId)`, one query per form open; **not** `countPayments` (counts voided rows on purpose).

**Still possible:** unskipping an old month can leave unpaid behind paid — left open by choice; card reads **"Overdue"** (never "✓ Paid" = owes nothing), so it can't reach the screen even from legacy data.

---

## Payment Scenarios

Every month collects through **one** `CollectSheet`; scenarios differ only in what `resolveLinePrice(line)` hands it (plan or **special price**, see above). "Fixed" = _amount remembered_:

|Scenario|Condition|What happens|
|-|-|-|
|A — Fixed|`resolveLinePrice(line).isFixed`, `durationMonths = 1`|Item carries remembered amount; **Quick pay** = one tap; sheet only for less than full.|
|B — Part of it|Same as A|Amount editable — 12 of 20 → preview _"leaves 8 owing"_.|
|C — Custom|`!isFixed` (custom-price plan or no plan, no special price)|**Quick pay opens the sheet** (caption _"No set price — type the amount"_; **Collect part** dropped — typed amount IS the bill). **Pay & send on WhatsApp** same door, sends after save.|
|D — Multi-month|`durationMonths > 1`|Block's cells → **ONE** item billed from first month (else billed 3×). Quick pay confirms range first.|

**Full vs partial = amount typed.** No mode switch; waterfall shows what it settles, rest stays owed. A month getting _nothing_ isn't recorded (already `unpaid`; an empty bill says nothing).

**Partial (`collected < amount`) resolves `"paid"`** for month + customer — no "partial" status, no guard/filter/aggregation change (`gotchas.md` → Ledger; CLAUDE.md → Month Grid). Presentation only, off `entry.balance > 0`:

|Surface|Full|Partial|
|-|-|-|
|`MonthCell`|paid fill, `Paid`|same fill **+ amber ring**, `PARTIAL`|
|`BillSheet` hero|collected amount|`20/50 $` collected/owed (`formatPaidFraction`)|
|`DebtItemCard`|—|`20/50 $` on date line|

**Ring, not fill** (non-regular paid cell is already yellow); multi-month block rings **first** cell only (`!entry.isGroupSecondary`), else borders seam the joined pill.

**Correcting money = void, never edit.** A bill's price can be corrected (edit the sale / the hand-typed fee); money can't — a hand-over is a physical event (date, collector, custody); never rewritten so the trail stays true.

**Correct amount** (payment row menu beside Void payment, on bill sheet, sale receipt, Money received) does that void when only the NUMBER was wrong. `CorrectCollectionSheet`: recorded amount, one amount box, split preview; Save → `CollectionService.correct` → ONE write `ICollectionRepository.replace`. Kept / changed / refused rules → gotcha #171 (also keeps customer). Extra: preview is read-only — no bill skippable (skipping an older month moves its money to a newer one, breaks oldest-first); if the BILL was typed wrong too, void the payment and collect again; old row's void reason = "Corrected from X to Y" + optional typed reason.

**Payment details.** Tap a payment → `CollectionDetailSheet`, from: bill payments list row (month bill sheet, sale receipt), wallet card (Wallets, My Wallet), multi-bill or voided card in Money received (single-bill card opens its bill, §17.2). Shows amount (+ `≈` display-currency), kind, **Received on**, **Recorded in the app on** (only if different), taker, where cash is / when+by whom banked, notes, void details, each bill paid w/ its slice, bill total, due date. Read-only — row 3-dot keeps Send / Correct amount / Void. Paints from list row, then re-reads (`collectionService.getListItem`) to name bills w/ plan or sale receipt number. Only Money received lets a bill card open its bill (others already in a sheet — no stacking).

---

## Multi-Select & Bulk Actions

Long-press a card → selection mode: avatars become checkboxes, `PageHeader` → icon-action toolbar. **Ephemeral Presentation state** — no slice/service/repo.

**Building blocks (domain-agnostic):**

- `useSelection()` — `Shared/src/shared/hooks/useSelection.ts` (web month table too) → `{ active, selectedIds, count, isSelected, toggle, toggleMany, enterWith, clear }`. `active` **derived** from `selectedIds.size > 0` (last deselect auto-exits). Mutators `useCallback([])`-stable. `toggleMany(ids)` flips a group atomically (all selected → remove all, else add all); `enterWith(id | ids)` — both let the month grid move a multi-month block as one unit.
- `useSelectionBackHandler(active, onExit)` — `SubsTrack/src/shared/hooks/useSelectionBackHandler.ts`, phone only: focus-gated Android `BackHandler` (expo-router `useFocusEffect`), back exits selection. App's only `BackHandler`; no-op iOS/web.
- `SelectionBar` — `SubsTrack/src/shared/components/SelectionBar.tsx`: **the one selection row on every list/panel**: optional **select-all checkbox**, X, "N selected" (`common.selected_count`), icon actions. Props `{ count, actions, onClose, allSelected?, onToggleAll? }`; checkbox only w/ `onToggleAll`. `onToggleAll` → `toggleMany(visibleIds)`; `allSelected` = `visible.every(selected)` — "all" = **visible/loaded** rows (post-filter/pagination), never unloaded pages. `SelectionAction = { key, icon, label /*=a11y label*/, onPress, destructive?, disabled? }`.
- `PageHeader` `selection?: { active, count, actions, onClose, allSelected?, onToggleAll? }` (`SubsTrack/src/shared/components/PageHeader.tsx`): when `active`, `SelectionBar` replaces the whole header (branch selector gone), select-all passed through. Header screens wrap search/filter row in `SelectionOverlaySlot` only to **blank its space** (no jump), not to host a select-all bar. Transactions panels (no `PageHeader`) render `SelectionBar` inline. Optional prop.
- `Checkbox` — `SubsTrack/src/shared/components/Checkbox.tsx`, presentational (parent owns tap).

**Card:** `CustomerCard` optional `selectionMode`, `selected`, `onToggleSelect`, `onEnterSelection`. Selecting: tap toggles (not open), long-press off, avatar `<View>` → `<Checkbox>` of **same footprint**, 3-dots hidden. Otherwise `ActionMenu` unchanged.

**Customers** (`SubsTrack/src/modules/customers/screens/CustomerListScreen.tsx`): ids resolved against **visible** `filtered` (`selectedCustomers`) → filtered-out rows untouchable. **1 selected:** edit · activate/deactivate · delete · quick-pay (toggle + delete admin-only); **>1:** delete · quick-pay (toggle verb ambiguous over mixed set). Search + FAB hidden. Cleared on tab switch, pull-to-refresh, branch change; pagination keeps it.

**Bulk quick pay:** ONE hand-over per customer per currency (`quickPayInputs` in `quickPay.ts` groups; `Shared/src/modules/customer/customers/hooks/useQuickPay.ts` calls `ledger.collect` per group; phone + web). `bulkQuickPayPlan` partitions: eligible fixed-price lines → collected (single + multi-month, each at own resolved price for current month); custom-price / plan-less → **skipped**; ineligible (inactive / non-regular / covered / backlogged / before start) → silently dropped. Confirm always shown: how many multi-month lines charge full duration, how many no-usable-price lines skipped (per LINE — every open-item line, zero-priced fixed plan incl.); info dialog w/ `hideCancel` if nothing payable. Each group own write → partial failure real, via hook `onNotice` (phone `bulkNotice` `ErrorBanner`, web info banner); no all-or-nothing upsert (gone w/ batched `createMany`). **Bulk delete:** `customerSlice.bulkDeleteCustomers` → `CustomerService.deleteManyCustomers` → one `customersWithPayments` + parallel `deactivateMany`/`deleteMany` (batch note below); slice adjusts `activeCount` by deleted active rows. Lone selection → single `handleDeleteCustomer` confirm.

**All list screens:** Products, Plans, Users, Branches, Currencies, both Sales lists. Cards (`ProductCard`/`PlanCard`/`UserCard`/`BranchCard`/`CurrencyCard`/`SaleCard`) take the four props + `<Checkbox>` swap; screens wire `useSelection()` + `useSelectionBackHandler()`, resolve ids vs **visible** list, pass `selection={…}` to `<PageHeader>`, hide search/FAB. **1 selected:** edit (+ state toggle: deactivate/reactivate branches/currencies, reactivate inactive products, activate/deactivate manageable users); **any count:** destructive verb.

**Bulk delete = real batch, never per-row loop.** `deleteMany`/`bulkDelete*` chain: `repository.deleteMany(ids)` / `deactivateMany(ids)` = one `.in('id', ids)` each; service splits hard vs soft via one ref query (`BaseRepository.referencedIdsIn(table, column, ids)`) → **≤3 round-trips regardless of N** (refs → batch soft-update ∥ batch hard-delete). Returns `{ hard, soft }`; `bulkDelete*` applies to `items` (remove hard, soft → `active:false`) + refreshes usage, no refetch. Errors → slice `error` banner (all-or-nothing, no "X of Y"). Soft/hard per module = single delete: **products** (sales ref), **currencies** (plan/payment ref), **branches** (user/customer/plan ref + "≥1 active branch must survive" via `countActiveAmong`), **customers** (payment ref → soft sets `cancelled_at`, hard cascades payments), **plans** (always hard; customers fall back via `ON DELETE SET NULL`).

**Deactivate ≠ delete** (branches, currencies): ⋮ Deactivate → `deactivateBranch` / `deactivateCurrency`, only `active = false`, even if unused. Only **Delete** removes, and only unreferenced rows (never route Deactivate to delete — it silently hard-deleted unused rows).

- **Users** (partial exception): `delete-user` **edge function** removes auth user → no single SQL. `UserService.deleteUsers`: one `usersWithPayments`, one `setActiveMany` soft-delete; only auth hard-deletes = parallel edge calls. Permission per id (`checkToggleActivePermission`); screen pre-filters `canManage` (own account / role hierarchy), reports skipped (`users.bulk_delete_skipped` / `bulk_delete_none`).
- **Sales** (no edit; destructive = **void w/ shared reason**): "void" → `SubsTrack/src/modules/sales/components/SaleBulkVoidSheet.tsx` (`ConfirmDialog` + reason `TextInput`, like `BulkVoidSheet`) → `saleSlice.voidSales(ids, voidedBy, reason)`: per-row loop over `saleService.voidSale` (audit-logged single-row, not batchable), drops voided rows, returns `{ ok, failed }`. Total failure keeps dialog open w/ error; any success closes, reports `common.bulk_void_summary`. `CustomerSalesListScreen` reuses it, then `refresh()`es `useCustomerSalesList` (voids go via global slice so Sales tab cache drops the row).

### Month-grid bulk actions

Own selection mode on customer detail grid (same `useSelection()`, one customer's months), owned by `Shared/src/modules/customer/customer-payments/hooks/useCustomerMonthGrid.ts` (both apps), keyed by `billingMonth`. Phone long-presses a tile; web checks a tile or table-row checkbox.

- **Entry/exit:** long-press non-`before_start` cell; tap toggles; cell 3-dot hides; exit via X / Android back / emptying / **year change** / unmount. `before_start` inert.
- **Toolbar:** `InlineSelectionToolbar` (`X · "N selected" · [Pay] [Void]`; compact toolbar for embedded panels, `src/shared/components/`) = **absolute overlay on the year-header row** (`relative` wrapper, `bg-white`), not page header — **on purpose**: pushing grid down mid-long-press shifts cells under the finger, toggling the wrong month on release. Pay if ≥1 payable, Void if ≥1 voidable; mixed → **both**, each on its subset.
- **Cell:** selected = `border-2 border-primary` + filled check-circle (3-dot spot); selectable-unselected = empty circle; status colour stays.
- **Auto-expand** (`SubsTrack/src/modules/customer-payments/utils/monthSelection.ts` `expandSelectionUnit`): live-payment cell → **every visible month w/ that `payment.id`** (whole block); multi-month-plan payable cell → **start-aligned N-month window**; else the cell. Windows anchored at **line's** `startDate` via absolute month index → no overlap, never before start.
- **Collect:** selected payable cells → `OpenItem`s → the ONE collect sheet (waterfall oldest-first, preview before save). **Multi-month** → one item per block via `groupPayableBlocks`, billed from block's first month (never 3×). **No bulk void here**: one hand-over can cover several months, so undo is a payment decision in `BillSheet`.
- **Loops sequential** (`loadingCreate`/`loadingVoid` early-return, as customer list); per-iteration `getStore().getState().payments` checks → amber `bulkNotice` on partial failure. Multi-month w/ missing/disallowing tier = failed (`assertMultiMonth`).

---

## Audit Trail

**Append-only** who-changed-what-when + old value (the fact an admin-vs-staff dispute turns on; nothing else kept it).

**App writes the trail, NEVER a Postgres trigger**: trigger fires when row reaches Postgres (offline → next sync) → stamps sync moment + syncing session, not real action/person; never-synced device = no history. Each repository writes its audit row alongside the change. (`new-features.md` §9.1 "triggers, no app code" predates offline-first.)

**Row** (`audit_logs`): `tenant_id`, `branch_id` (denormalized from row/parent; NULL = tenant-wide), `table_name`, `record_id`, `action` (`create` | `update` | `delete` | `void` | `restore`, CHECK), `before_data` / `after_data` / `changed` (JSONB), `label`, `subject`, `subject_id`, `actor_user_id`, `actor_username`, `occurred_at`, `created_at`, `updated_at`.

- **Edit keeps only changed columns**: `changed` = names, `before_data`/`after_data` = their old/new values (~150 bytes) → entry self-contained. **Create** = whole row in `after_data`; **delete** = whole row in `before_data`.
- `updated_at` + generated `balance` excluded from diff → untouched save writes nothing (`buildAuditRow` returns `null`).
- `actor_username` = snapshot (survives user deletion).
- `label` = frozen one-liner, `describeAudit(table, row)`, row's **own** columns only (other table's name dangles after delete; cf. `sales.items_summary`).
- `subject` = who the record belongs to (customer behind payment/sale/skip/service line). Frozen b/c a read-time `customer_id` → name lookup is empty once the customer is deleted, exactly when the trail matters. Writer supplies it via `customerAudit(customerId)` on both base classes → `{ branchId, subject, customerId }`, one query (branch lookup already ran there → free). Sales own `branch_id` → `customerSubject(customerId)` (`null` for walk-in). On `customers` record **is** subject: `buildAuditRow` uses row's `name`, no caller passes it. NULL for nobody's records (plan, setting, staff) + pre-column rows.
- `subject_id` = same owner as id, key for "everything about this customer". Frozen, never joined to `customers` (only compared) → survives deletion. `buildAuditRow` takes `AuditInput.customerId` (payments, service lines, skips pass it), fallback `record_id` on `customers`. NULL when writer names no customer, incl. sales (outside customer timeline). **No backfill**: pre-column entries NULL, absent from customer history; existing DB needs `reset.sql` (dev) or manual `ALTER TABLE audit_logs ADD COLUMN subject_id UUID`. Why not child-id lists → gotcha #75.
- `occurred_at` = **device clock** (when acted). **Never** sort/display by `updated_at` (server clock + sync cursor).
- `branch_id` **no FK** on purpose: `ON DELETE SET NULL` would blank trail on branch delete; evidence outlives branch. (`tenant_id` cascades, `actor_user_id` sets null.)
- Indexes: `(tenant_id, occurred_at DESC)`, `(table_name, record_id, occurred_at DESC)`, `(subject_id, occurred_at DESC)`, `(actor_user_id, occurred_at DESC)`, `(updated_at)` (pull cursor).

**RLS — 3 policies + deliberate absence:** `audit_logs_select` **admins only** (reuses `tenant_settings_write` role test), branch-aware on row's `branch_id`. `audit_logs_insert` **every** member (staff pushes own trail, can't read it). **No UPDATE/DELETE policy** → append-only; only `service_role` rewrites/purges (same idiom as `app_options`). Not a bug: staff pull returns no audit rows → local table = only own un-pushed rows.

**Audited** (`AUDITED_TABLES`, `Shared/src/modules/admin/audit/utils/constants.ts`), 15: `charges`, `collections`, `sales`, `customers`, `customer_plans`, `skipped_months`, `products`, `services`, `stock_movements`, `plans`, `users`, `branches`, `currencies`, `tenant_settings`, `customer_requests`.

**`stock_movements`: CHANGES ONLY (edit/revert), never insert** — ledger row already names actor/note/time; but a manual row can be corrected in place (`#editing-a-stock-entry`) or reverted (`#reverting-a-stock-entry`) and nothing else remembers it said 12 or who killed it. `addMovements` no entry; `updateMovement` → `update`, `voidMovement` → `void`. Filed under parent **product's** `branch_id` + **name** (movement owns neither; via `auditedUpdate`'s `audit` option = general seam for child rows whose parent owns those facts) → `subject` is a product, so `subjectLabel()` / card subject icon key off table, never assume a person.

**Not audited:** `sale_items` (parent sale covers it, `items_summary` frozen); **`collection_items`** (parent collection's `after_data` holds whole split → "55 → 20 Jan, 20 Feb, 15 Sale #13"); `exception_logs`, `audit_logs`; `app_options` / `tenants` (never written by app, `scope: 'global'`). Older rows of the two dropped tables still render (locale table-label keys kept for that); filter no longer offers them.

**Writing — one line per call site:**

- `BaseRepository.audit(input)` (web/online): **fire-and-forget, never throws**, returns `void`, background insert → never delays save spinner. Call **without `await`**.
- Child row: pass `customerId`, not resolved `subject`/`branchId`; `audit()` looks it up **inside** the detached write, fills only omitted fields (sales pass `branchId` → only name inherited).
- `OfflineBaseRepository.auditIn(db, input)` (native): **inside caller's `write()` transaction** → change + trail commit/roll back together; failure **does** propagate (rollback correct).
- `auditedUpdate()` / `auditedDelete()` (both base classes) wrap read-patch-diff. `branchColumn: null` = no branch dimension; `branchColumn: 'id'` for `branches`.
- Builders `Shared/src/core/audit/`: `buildAuditRow.ts` (diff + actor/tenant/timestamps, `null` if unchanged), `describe.ts` (`label`). Actor via **lazy `require`** of global store (require-cycle, same as `src/core/errorLog/errorLogger.ts`; top-level store import from a file `BaseRepository` imports crashes).

**Reading** (`src/modules/admin/audit/`): `IAuditRepository` **read-only**; writes never go through it.

- **Server-first always, no caller-chosen scope.** `OfflineAuditRepository` delegates to Supabase, merges device's **un-pushed** rows (`_dirty = 1`, same filter, de-duped by id) on top (exist nowhere else until push). Un-pushed join **page 0 only** (newest; every page would repeat them).
- **Offline/unreachable degrades, never fails** → local 30-day window, `source: 'local'` → one-line UI note. Less is OK, nothing isn't. (Replaced `RequiresConnectionError` + "Load full history" button.)
- Order `occurred_at DESC`, never `updated_at`.
- Returns `{ rows, source }` (+ `hasMore` paged). **`hasMore` is the repository's answer**: merged `rows` length can't show if server page was full, and paging differs — local `OFFLINE_PAGE_SIZE` (100), Supabase `PAGE_SIZE` (30).

**UI — Admin → Audit Log** (`app/(app)/(tabs)/admin/audit.tsx`): filter chips (record type / action / staff / date range), day-ordered list, tap → field-by-field _before → new_ diff sheet; one-line note above list ("the full history from the server" / "No connection — the last 30 days saved on this device"), informational only (nothing to press).

**Entry = SENTENCE built at read time** — "Super Admin voided the **March 2026** bill for **John Doe**", "…changed Price on the plan **Gold** from 10.00 $ to **12.00 $**", "…updated Price, Name and 3 other fields on the plan **Gold**". Card = sentence over muted timestamp, action only as small coloured icon; sheet repeats sentence on top, meta / diff / snapshot cards below. `buildAuditSummary` (`audit/utils/summary.ts`, pure) uses a **special** template when generic would misstate: `active` → "deactivated", `written_off_at` → "wrote off", `skipped_months` create → "skipped March 2026", edit of own name → "renamed X to Y"; else one generic template per action, single-field case with own _from → to_. Record name from `recordDetail()` per table (month label, `#RECEIPT`, plan name, money) → identity columns ride with diffs: **gotcha #132** (+ why bold in translations is a marker pair, not `<Trans>`). Bill/hand-over names its **service line** in brackets ("added a new **March 2026** bill (plan **Internet**)", "recorded a **subscription payment** of **20.00 $** (plan **Internet**)") b/c two lines bill same months; hand-over over two lines (or line + sale) names none, like `kind` 'mixed': **gotcha #141**. Trail money formatted via display registry in its **stored currency**, never re-converted.

Per-record **History** (all `RecordHistorySheet`): Products / Plans / Staff / Branches / Currencies → card 3-dot menu right under **Edit**; bill (`BillSheet`) → record-history action, **admin-only** (mirrors read policy); sale receipt (`SaleDetailSheet`) → same button above Void; customer → own sheet (below).

**Another list = two lines, deliberately**: `useHistoryDoor(table)` (`audit/hooks/`) → `{ open, sheet }`; menu key `history` runs `history.open(recordId, name)`, render `{history.sheet}` once beside `<ActionMenu>`. Hook owns open-record state (no screen keeps its own). Menu row for **every** role: non-admin gets "Admins only", never an empty list (false "never changed"). The two receipt sheets gate on `isAdmin` (staff-facing; dead-end button worse than none).

`subtitle` = record's name (product/plan/branch name, staff full name, currency **code**, sale's frozen `items_summary`, payment month label) under sheet title → trail never anonymous.

**Header branch chip narrows list; RLS alone insufficient → gotcha #73** (`AuditFilter.branchFilter`: `resolveBranchFilter(get().auth.user)` in audit slice → `applyBranchFilter` / `branchWhere`; `branchFilter` in `useFocusEffect` deps; scope **`shared`, not `owned`**). `audit_logs` deliberately **not** in `BRANCH_SCOPES` — constant local to each audit repository so nothing else inherits wrong semantics.

**Customer trail**: `CustomerHistorySheet` (`modules/customer/customers/components/`), from list card's quick-actions menu **and** clock icon in customer detail header. One newest-first timeline: customer row + **every service line ever held** + **month payments + skips** on them. Read: `IAuditRepository.findForCustomer(customerId, tables)` — one indexed query, `WHERE subject_id = ? AND table_name IN (…)`, `occurred_at DESC`, tables `CUSTOMER_HISTORY_TABLES` (`customers`, `customer_plans`, `charges`, `collections`, `skipped_months`). Replaced `findForRecords(targets)` (→ gotcha #75), which stays for multi-row entities sharing no customer. **Sales excluded** (own panel; would bury subscription timeline) → no `subject_id`; to add: pass `customerId` at sale audit call sites + extend `CUSTOMER_HISTORY_TABLES`. `charges` + `collections` included (customer's money). Offered to **every role** (staff use these screens constantly) → "Admins only" state for non-admin, **never** empty list.

**Entry card = two lines, a constraint**: `AuditEntryCard` = **record type + `subject` + action pill** / **staff · when**. Never re-add changed-field chips (3–4-line rows, a wall, less info than one tap); what moved = detail sheet's job. Action = **colour + icon + pill**, never prose (scan by shape).

**Detail sheet top card: Customer · Staff · When · Fields changed** — moved columns' human **names**, comma-joined (`changedFieldsLabel`), **hidden on create/delete** (snapshot lists all). Never bring back the "Record" row printing frozen `label` (raw values glued with `·`, "2026-10-01 · 600"; can't pass display registry; repeats snapshot on create). **`label` still written**, no UI reader now. Trade-off: an **edit** names customer but not which record (month only if `billing_month` changed) — fix = add `billing_month` to `CONTEXT_FIELDS` + read-time label row.

**`<HistoryList>`** (`components/HistoryList.tsx`), both admin views: purely presentational (entries + loading/error/scope in; `onLoadMore` / `onLoadFull` / `onRefresh` out), no query state. `inSheet` → Gorhom `BottomSheetFlatList` (plain `FlatList` can't scroll in a sheet). Reuse for any "history of X"; never rebuild list/scope note/detail plumbing.

**`<HistorySheet>`** (`components/HistorySheet.tsx`) = every history sheet's shell: full-height `AppBottomSheet`, draggable header (title + record name + Close), **admin gate**, `<HistoryList>`. Renders, never loads; only the hook differs: `RecordHistorySheet` = `useRecordHistory` (`table` + `recordId`), `CustomerHistorySheet` = `useCustomerHistory` (`subject_id`). New "history of X" = new loader, not sheet. Gate **in the shell** stops new call sites shipping the empty-list lie.

**Raw value display — per-column registry.** Trail stores raw columns on purpose (evidence) → `month_start`, `admin`, currency UUID unreadable. `valueDisplay.ts` (`modules/admin/audit/utils/`) = the ONE column → text map, a registry, not `if` chains in the sheet:

```ts
const DISPLAY: Record<string, AuditValueFormatter> = {
  "*.currency_id": currency, // any table
  "users.role": enumLabel({ admin: "users.admin", user: "users.user" }), // one table
};
```

- Formatter returns `null` if unrecognized → falls to `formatValue`. **Never blank, never crash.**
- Flat, keyed `<table>.<column>`; `*.<column>` for same-everywhere columns (five person ids, `currency_id`, `branch_id`). Order: table key → wildcard → `formatValue`.
- `enumLabel({ raw: 'i18n.key' })` for codes; `idRef(kind, { blank, missing })` for ids — `blank` = what NULL means _there_ (null currency = USD; null branch "Shared" on plan, "Unassigned" on customer), `missing` = deleted ref ("Deleted user" / "(deleted)") → never a UUID.
- **Ids resolve at READ time** via `useAuditLookups()` (staff + currencies + branches; each `getX()` guards on `loaded`); write-time names go stale on rename.
- `FIELD_LABELS` (`displayFieldLabel` → `formatFieldLabel`) names the **column** when a sibling decides it: `tenant_settings.value` → "Unpaid months rule", not "Value". Feeds diff row title + "Fields changed"; keeps setting edits readable without rendered `label` (old `LABELS` / `displayLabel` removed).
- `showsColumn()` = what create/delete snapshot lists: never `id`, `tenant_id`, `created_at`, `updated_at`, `balance` (diff's hidden set); id columns only if registry names them ("Currency: LBP", "Received by: John" shown; `customer_id`, `plan_id` hidden).
- **Sibling-dependent values**: `tenant_settings.value` = `month_start` under one key, currency id under another. `CONTEXT_FIELDS` (`buildAuditRow.ts`) copies such columns into edit payload even unchanged, **outside `changed`** (never render as change) → `AuditEntry.context`. Older rows fall back to raw value.

**Read state split by lifetime — never move the record timeline into the slice, nor the filter session out:**

- Filter session + paging (`tableFilter`, `actorFilter`, `from`/`to`, `scope`, `page`, `hasMore`) → **`audit` slice** (`useAuditSlice`), in `globalStore.ts`, reset in `storeReset.ts`, refreshed in `refreshActiveData.ts`: survives entry → back; **must** clear on logout (no previous-tenant entries).
- One record's timeline → **`useRecordHistory(targets)`** / **`useCustomerHistory(customerId)`**, sheet-local: in the store it needed parallel `recordItems`/`recordLoading`/`recordError` that two open sheets overwrite + manual clear on close; unmount discards; has stale-response guard. Both wrap `useAuditTimeline(key, load)` — `key` a plain **string**, `load` **module-level**, else new identity each render → infinite re-fetch.

**Storage** ~150 B/row; busy tenant ~600 changes/month ≈ 90 KB/month local, ~1 MB/year server.

**Shipping** OTA-safe (no native module); run `sql scripts/script.sql` **before** publishing (push writes columns server must have).

Offline specifics (`appendOnly` + `pullDays` flags, `json` column type, local pruning) → `docs/offline.md`; traps → gotchas #57–#63.

---

## Developer Tools

**Native + admins only**: `IS_OFFLINE_CAPABLE` (views the native-only SQLite mirror) **and `isAdmin`** (export = plaintext of every customer/amount/collection). Entry Settings → Data → "Developer" row (hidden on web + non-admins; screen re-checks both — deep-linkable).

- **Table browser** (`SubsTrack/src/modules/settings/developer/screens/DeveloperScreen.tsx`): every `TABLES` entry (`src/core/offline/db/tables.ts`) + `sync_meta`, `pending_deletes` (not in descriptor), live row counts. Tap → `DbTableViewer` (`SubsTrack/src/shared/components/DbTableViewer.tsx`): self-contained, only a `tableName` prop, runs `SELECT * FROM <table>`, columns from rows, horizontal-scroll read-only grid. No editing anywhere.
- **Export**: whole mirror → one JSON → share sheet. Refused while un-pushed writes exist ("Sync now" button) → always complete synced snapshot; `_dirty` stripped, delete queue never carried. Streamed per row (heap-safe).
- **Import**: `.json`, refused > 64 MB before parse, fully validated before DB touch — wrong org (**every row**, not just header), wrong branch view, own account missing, duplicate ids, non-primitive values, missing tables. Then destructive confirm, then confirm **also replace server copy** (overwrite + add, never deletes server-only rows; online only). One transaction, sync suspended; then stores reset + re-read. Full rules → `docs/offline.md` → Exception logger + Developer page.
- **Exception logging**: every caught error — render (`ErrorBoundary`), uncaught JS (RN global `ErrorUtils`), every repository catch (`BaseRepository`/`OfflineBaseRepository` shared `handleError`) → local `exception_logs` via `logException()` (`src/core/errorLog/errorLogger.ts`), tagged user/tenant + `source` (`boundary` | `global_handler` | `repository` | `service`). Synced tenant table, **push-only** (`docs/offline.md`): up to Supabase, never pulled to any mirror. Browsable in Developer.

---

## Collector Wallet

**Wallet** = cash a user **physically holds now**; **computed at runtime, never a stored balance**. Only persistence: 3 columns on `collections` (the ONE cash table):

- `held_by_user_id` — holder **now**; NULL = nobody (never attributed, or settled out).
- `remitted_at` / `remitted_by` — **final settlement** (when cash left the chain, who took it); only written w/ `held_by_user_id = NULL` (`chk_*_custody`).

`received_by_user_id` / `recorded_by_user_id` = collector, never change ("Collected by Ali" survives receipt). No new table: ledger keyed by payment id goes stale (re-pay of voided month reuses row, gotcha #43); column resets cleanly.

### The chain

Cash moves **up** one rung, **never sideways**:

```
collector (user)  →  branch admin  →  tenant-wide admin  →  owner (superadmin)
   rank 0              rank 1             rank 2                 rank 3
                                             │                      │
                                       "Close out"            receiving
                                             └──── out of the system ────┘
```

Branch + tenant-wide admin both `role = 'admin'`; only `branch_id` (`NULL` = tenant-wide) separates them. **Role alone never decides a handover** (old bug: `assertAdmin(role)` let a branch admin receive their **own** wallet).

Rules, one pure file `Shared/src/modules/wallet/utils/custody.ts`:

- `walletRank(u)` → 0–3 from `role` + `branchId`.
- `receiveBlock(receiver, holder)` → `'self'` | `'rank'` | `'branch'` | `null`, in that order (caption names first real reason). **`self`**: nobody clears own cash. **`rank`**: strictly lower only (peers never take from each other). **`branch`**: branch admin → own branch only → **unassigned** collector (`branchId` null) reachable only from rank 2+.
- `canCloseOut(u)` → rank ≥ 2 (top has nobody above; else wallet + dashboard cash tile only grow).
- `custodyTargetFor(receiver)` → receiver's id, or `null` for owner (no wallet).

**Two layers**: `WalletService` asserts before every write; UI disables via same helper w/ caption. **Service-layer** only — `collections_all` is `FOR ALL` w/ tenant+branch predicates, like `UserService.checkToggleActivePermission`.

> **Asymmetry.** Cash the owner _receives_ leaves the system; cash the owner _collects_ starts in their **My Wallet** like anyone's, where "Close out" = same end state.

### What counts as held cash

Non-voided rows w/ `held_by_user_id = <the user>`, across the three cash sources:

- `collections.amount` — every hand-over, whatever it settled.

Held row's `kind` = the one `charges.kind` all lines share, else **`mixed`** (one hand-over can settle month AND sale; physical cash can't be split). `charges` **excluded** (owed to business, not held).

**Per-currency + USD**: `WalletService` groups by currency (`WalletCurrencyTotal` = raw cash **plus** USD value), sums USD via each row's frozen `rate_per_usd_snapshot` (drift-free, like `LedgerService`/`DashboardService`). List: one USD headline per wallet (in display currency); detail: per-currency breakdown when > 1.

### Acting on a wallet

One of three **modes**, decided once (`modeFor` in `WalletsScreen`, from flags baked into each `UserWallet`) → card menu + detail sheet agree:

|mode|when|does|
|-|-|-|
|`receive`|`receiveBlock === null`|cash → **viewer's** wallet (or out, for owner)|
|`close_out`|own wallet + `canCloseOut`|banked, out of system|
|`view`|neither|look only; menu says **why**|

Each mode: single-row action, **long-press multi-select** + selection bar, bulk ("Receive all" / "Close out all", re-reads current set first → never stale).

Write = `transferCustody(ids, fromUserId, toUserId, actorUserId)` per cash repository (`toUserId` null = settle out + stamps `remitted_at`/`remitted_by`). UPDATE **guarded on `fromUserId` + `voided_at IS NULL`** (both repos) → already-taken / voided rows skipped (racing admins can't double-count); server in 100-id chunks. Doors both apps: Shared `useWalletActions` (confirm copy `walletActConfirm`, `busyHolderId`) over `walletStore`; mode/menus/source labels `wallet/utils/walletView.ts` (`walletActionMode`, `walletMenuItems`, `walletItemMenuItems`, `walletSelectionItems`, `WALLET_SOURCE_LABEL_KEY`, `cashOnHandUsd`). `custodyValues()` = one column-set builder so both exits never drift.

### Detail-view transaction list

`WalletDetailView` (admin sheet + self-view, differ by `mode`): card per transaction — **customer** primary (walk-in → "Walk-in"), then `type · descriptor · date · Collected by <name>`, amount. **"Collected by" only once cash moved** (else holder = collector, noise). Client-side **filters** (customer, payment type, from/to **date range** on the LOCAL day) narrow the list only, never the headline total — Shared `useWalletItemFilters` / `walletItemFilter.ts`, reset per holder.

### Self-correcting

Derived → void/edit of source row shows on next fetch. Void + re-pay of a month **resets** custody to collector (fresh cash), in payment upsert's reset block w/ remittance nulls. Settled cash whose source is later voided → holder total **negative** (business owes them) — correct, shown as negative USD.

Holder ≠ always collector (admin who only received recorded none) → `UserService` hard-vs-soft delete counts rows they **hold** + recorded, else `ON DELETE SET NULL` empties their wallet.

### Where it lives

- **Admin → Wallets** (`app/(app)/(tabs)/admin/wallets.tsx` → `WalletsScreen`): every wallet in branch scope **incl. viewer's own** ("You" chip, no receive). Holder viewer can't read (users RLS branch-scoped; branch admin can't see tenant-wide admin) → **dropped** (un-nameable, un-actionable = worse than nothing).
- **Web**: `/admin/wallets` (`Web/src/modules/wallet/screens/WalletsPage.tsx`), `/admin/wallets/:holderId` + `/my-wallet` share `WalletDetail.tsx` — see `docs/ui-patterns.md`.
- **Settings → My Wallet** (`app/(app)/(tabs)/settings/my-wallet.tsx` → `MyWalletScreen`), every user: own cash; read-only below rank 2, "Close out" for tenant-wide admin/owner.
- Dashboard (**admin-only**) **Cash on hand** tile: branch's un-settled net USD + `{holders} · {transactions}`, only when > 0. `DashboardService.getMetrics(branchFilter, viewer)` folds `walletService.getWalletsView(viewer, branchFilter)` into `walletCash` / `walletCollectors` / `walletTransactions`; slice passes `viewer = null` for non-admin → not computed.

### Code map

`src/modules/wallet/` — `utils/custody.ts` (rules), `utils/custodyValues.ts` (move columns), `services/WalletService.ts`, `screens/`, `components/WalletDetailView.tsx` + `WalletCard.tsx`; slice `src/state/slices/wallet/walletSlice.ts` (`useWalletSlice`). Three cash services expose `getHeldForWallet(...)` / `getHeldDebtPayments(...)` + `transferCustody(...)` / `transferDebtPaymentCustody(...)`, backed by repository `heldForWallet` / `transferCustody` (web + offline). Types `WalletItem` / `WalletCurrencyTotal` / `UserWallet` / `UserWalletDetail` / `WalletSource` / `ReceiveBlock` in `Shared/src/core/types`.

### Historical data

`script.sql` backfills `held_by_user_id = <the collector>` on rows **never handed over** (wallets unchanged); already-remitted rows stay `NULL` (out of system → no retroactive fill). Idempotent; `updated_at` trigger fires → rows reach offline mirrors on next incremental pull.
