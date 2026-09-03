# Feature Deep-Dives

> Detailed behavior for each feature area. Read the relevant section BEFORE editing that area's code. Referenced from `CLAUDE.md`.
> The Month Grid algorithm itself stays in `CLAUDE.md` (it is the single most critical rule). This file covers everything built around it.

## Contents

- [Multi-Tenancy](#multi-tenancy)
- [Branches (multi-location)](#branches-multi-location)
- [Authentication Flow](#authentication-flow)
- [Multi-Month Plans](#multi-month-plans)
- [Multi-Currency](#multi-currency)
- [App Options (Global Config)](#app-options-global-config)
- [Tenant Settings (Per-Tenant Config)](#tenant-settings-per-tenant-config)
- [Subscription Tiers](#subscription-tiers)
- [Products & One-Off Sales](#products--one-off-sales)
  - [Services](#services)
- [Reports](#reports)
- [Expenses](#expenses)
- [WhatsApp Invoices](#whatsapp-invoices)
- [Transactions Hub](#transactions-hub)
- [The Ledger (charges + collections)](#the-ledger-charges--collections)
- [Regular Customer](#regular-customer)
- [Skipped Months](#skipped-months)
- [Multiple Plans per Customer (service lines)](#multiple-plans-per-customer-service-lines)
- [Pay Oldest Month First](#pay-oldest-month-first)
- [Payment Scenarios](#payment-scenarios)
- [Multi-Select & Bulk Actions](#multi-select--bulk-actions)
- [Audit Trail](#audit-trail)
- [Developer Tools](#developer-tools)

---

## Multi-Tenancy

- **RLS is the primary guard** — all queries automatically scoped to the caller's tenant via Supabase JWT claims.
- **App-level filtering** (`tenant_id` from `authStore`) is a secondary belt-and-suspenders guard.
- `tenant_id` is injected into the JWT by a Supabase auth hook at login. **Never derive it from client input.**
- Login email convention: `username@tenantcode.com` (synthetic, not a real email address).

---

## Branches (multi-location)

Tenants can optionally create branches/zones. A tenant with zero branches behaves exactly as before — feature is invisible.

**NULL semantics differ per table:**

| Table       | `branch_id IS NULL` means                                      |
| ----------- | -------------------------------------------------------------- |
| `users`     | Tenant-wide admin (sees all branches and unassigned records).  |
| `customers` | UNASSIGNED — visible only to tenant-wide admins.               |
| `plans`     | SHARED catalog item — visible to every branch.                 |
| `payments`  | (no `branch_id` column — inherits from customer via FK + JOIN) |

**RLS layered on tenant_id:**

- `public.current_branch_id()` reads `users.branch_id` for the calling user (SECURITY DEFINER).
- Policies admit a row when `tenant_id` matches AND either the caller is tenant-wide (`current_branch_id() IS NULL`) or the row's branch matches. Plans additionally admit `branch_id IS NULL` (shared) for everyone.
- Payments inherit via `EXISTS (SELECT 1 FROM customers c WHERE c.id = payments.customer_id AND c.branch_id = current_branch_id())`.
- Branch switching for tenant-wide admins is purely UI state in `uiPrefStore.currentBranchId` — no JWT change.

**UI:**

- [BranchSelector](../SubsTrack/src/shared/components/BranchSelector.tsx) is a chip rendered below `PageHeader` on Customers/Dashboard/Plans/Users. It self-conceals: only renders for tenant-wide admins (`user.branchId === null`) when ≥1 active branch exists.
- Options: All Branches (`null`) / each active branch / Unassigned (`BRANCH_FILTER_UNASSIGNED`).
- `useEffectiveBranchFilter()` / `resolveBranchFilter(user)` in [branchFilter.ts](../SubsTrack/src/shared/lib/branchFilter.ts) returns the active filter: branch-scoped users always get their own `branchId`; tenant-wide admins get `uiPrefStore.currentBranchId`.
- `applyBranchFilter(query, filter, column?)` mutates a supabase query builder: `null` → no-op, `BRANCH_FILTER_UNASSIGNED` → `.is(column, null)`, UUID → `.eq(column, uuid)`.

**Form behavior:**

- CustomerFormSheet: Branch picker only shown to tenant-wide admins. Branch-scoped users auto-assign their own branch. The plan dropdown filters to `branch_id IS NULL OR branch_id = selected_branch`, and the inline Plans editor's `PlanPicker` is **disabled** (greyed, with a "Select a branch first" hint) while no branch is chosen (`branchId === null`) — branch is required, so a plan can't be picked before it. `Dropdown` grew a `disabled`/`disabledHint` prop for this, threaded through `PlanPicker`.
- PlanFormSheet: Branch picker only for tenant-wide admins; nullable (= Shared, visible to every branch) — mirrors ProductFormSheet. Branch-scoped users always create branch-scoped plans (their own).
- UserFormSheet: Branch picker for tenant-wide admin. Once ≥1 branch exists, role=`user` requires a branch (enforced in `UserService.validate`). The `create-user` edge function additionally validates and forces branch_id for branch-scoped callers.

See gotchas #26–#32 for the full branch NULL-semantics + enforcement rules.

---

## Authentication Flow

```
app/index.tsx
  → authSlice.restoreSession()   (on mount)
  → if no session → redirect to (auth)/login
  → if session → redirect to (app)/(tabs)/home (admin) or (app)/(tabs)/customers (user)

LoginScreen
  → authSlice.login(username, tenantCode, password)
  → AuthService: email = `${username}@${tenantCode}.com`
  → AuthRepository.signIn(email, password)   [Supabase Auth]
  → AuthRepository.getUserProfile(userId)    [public.users]
  → AuthRepository.getTenant(tenantId)       [tenants joined with tier_plans]
  → stores AuthUser + tenantActive in authSlice
  → primePostAuth(user) — Promise.all of:
       get().currencies.fetchCurrencies()
       get().branches.fetchBranches()
       get().options.fetchOptions()         (loads global app_options — e.g. LiraRate)
       get().subscription.init(tenantId)
         → tierService.fetchTiers() (3 tier_plans rows)
         → tierService.fetchUsage() (counts customers/users/plans/branches/currencies)
         → tierService.getTenantWithTier(tenantId) — fresh tenant + joined tier
           → also writes back via authSlice.setUserTier so user.tenant.tier stays in sync

LoginScreen also exposes "Create a new organization" → signupSlice (2-step form):
  Step 1 (SignupOrganizationScreen)
    → signupSlice.validateAndCheckCode()
    → SignupService.validateOrganization() + repo.isTenantCodeAvailable()
    → on success → push /(auth)/signup-account
  Step 2 (SignupAccountScreen)
    → signupSlice.submit()
    → SignupService.createTenant() → SignupRepository.createTenant()
    → supabase.functions.invoke('create-tenant') [service-role server-side]
       atomically: tier_plans (lookup Free id) → tenants(tier_id=Free) →
       branches('Default Branch') → auth.users → public.users(role=superadmin, branch_id=null)
       cascading rollback on any step
    → auto-login via authSlice.login(...) with the just-entered credentials
    → root layout reacts to authSlice.user and routes into the app

app/(app)/_layout.tsx
  → if !user → redirect to login
  → if !tenantActive → show TenantInactiveScreen
  → otherwise → render tabs
```

**Hydration note:** `authSlice` exports an internal `primePostAuth(get, user)` helper called by `login` and `restoreSession`. It runs `get().currencies.fetchCurrencies()`, `get().branches.fetchBranches()`, `get().options.fetchOptions()`, and `get().subscription.init(tenantId)` in parallel via `Promise.all`. `subscription.init` is the **source of truth** for the active tier (see Subscription Tiers below).

See `docs/edge-functions.md` for `create-tenant` internals and gotcha #33 for the anon-path rationale.

---

## Multi-Month Plans

Plans can cover 1–12 consecutive months. When `durationMonths > 1`:

- The plan represents a **bundled price** for the entire period (not per-month).
- Multi-month plans **must have a fixed price** — `isCustomPrice` must be `false`.
- A single `Payment` record is created with `durationMonths` matching the plan. That payment covers all months in the range.

**Recording a multi-month payment (one bill, `duration_months > 1`):**

1. Builds a coverage set from existing active payments to detect conflicts.
2. If any months in the proposed range are already paid:
   - With `skipConflicts = false` → throws an error listing the conflicting months.
   - With `skipConflicts = true` → finds the first uncovered month, adjusts `effectiveStart` and `effectiveDuration`, records a single payment for the remaining range.
3. Returns `{ payment, skippedMonths }` so the UI can surface conflict info.

**Return types:**

```typescript
type MultiMonthConflict = { billingMonth: string; label: string };
type CreateMultiMonthPaymentResult = {
  payment: Payment;
  skippedMonths: MultiMonthConflict[];
};
```

See gotchas #13, #14, #15 for the storage + grid-rendering details.

---

## Multi-Currency

The app supports an arbitrary list of non-USD currencies per tenant. USD is the implicit base — never stored in the `currencies` table.

**Storage model: amount is as-typed, paired with `currency_id`.**

- `plans.price` + `plans.currency_id` — the price was literally `89000` in LBP (not 1.00 USD). Plan USD equivalents use the **live** rate (forward-looking pricing).
- `charges.amount` (what he was BILLED) and `collections.amount` (what he HANDED OVER), each with its own `currency_id` + `rate_per_usd_snapshot`. The customer literally handed over `89000 LBP`. **The LBP value is preserved forever**, and the USD equivalent is frozen at each row's own recording time. The two rates are deliberately separate: a debt total converts at the rate he was billed at, revenue and the wallet at the rate the cash arrived at. `BillSheet`, the year totals and every dashboard aggregate convert via the snapshot — they do not drift when the live rate is edited.
- `null currency_id` means USD throughout the codebase; USD payments store snapshot = 1.

**Conversion helpers** ([src/core/utils/currency.ts](../SubsTrack/src/core/utils/currency.ts)):

```ts
toUsd(amount, source: Currency | null): number       // null source → amount unchanged
fromUsd(amountUsd, target: Currency | null): number  // null target → amount unchanged
convert(amount, source, target): number              // go via USD
formatMoney(amount, source, target): string  // convert + Intl.NumberFormat
findCurrency(currencies, id | null): Currency | null
paymentSnapshotCurrency(payment, currencies): Currency | null  // returns the source Currency with ratePerUsd overridden by the payment's snapshot — use everywhere a historical payment amount is displayed
```

**`CurrencyInput`** ([src/shared/components/CurrencyInput.tsx](../SubsTrack/src/shared/components/CurrencyInput.tsx)) — the reusable input with an embedded currency dropdown. Used in PlanFormSheet (price) and CollectSheet (the amount received). The dropdown lists USD + active tenant currencies. Switching currency does NOT convert the typed number — switching means "I meant this number in the new currency."

**Display currency is per-TENANT, not per device** — stored in `tenant_settings` under the `DisplayCurrencyId` key (a `currencies.id`; blank/unset = USD), set by an admin in Tenant Settings and read everywhere through the `useDisplayCurrencyId()` hook. Every user of the organization therefore sees amounts in the same currency, on every device, and an admin's change reaches the others on their next sync/login. All read-only displays (PlanCard, DashboardScreen, admin/index revenue card, CustomerPaymentPanel year summary) convert their values to it at render. The currency a value was **stored in** is preserved in `BillSheet`'s primary line for receipt fidelity, with the display-currency equivalent as a secondary "≈" line. A soft-deleted / unknown id resolves to `null` via `findCurrency`, so the UI falls back to USD instead of crashing.

**Aggregates** (Dashboard) sum across mixed currencies by converting each row to USD using its `rate_per_usd_snapshot` (drift-free historical totals) in `DashboardService.getMetrics()`. The screen then formats the USD total in the tenant's display currency.

**Last-used currency** persists in [src/shared/lib/uiPrefStore.ts](../SubsTrack/src/shared/lib/uiPrefStore.ts) so the `CurrencyInput` dropdown defaults to whatever the user typed in last time.

**Currency deletion** is safety-guarded: `CurrencyService.deleteCurrency()` counts references in `plans` + `payments`. If non-zero, it does a soft-delete (sets `active = false`); otherwise it hard-deletes. `ON DELETE RESTRICT` on the FKs prevents any chance of orphaning historical data.

**Default Lebanese Pound currency.** Every newly created tenant is auto-seeded with an `LBP` (Lebanese Pound) currency (`decimals = 0`, `symbol = 'ل.ل'`). Its `rate_per_usd` is copied **once, at creation time**, from the global `app_options.LiraRate` option (see App Options below). After creation it is an ordinary editable tenant currency — the seed is a starting default, not a live link. Both tenant-creation paths seed it: SuperAdmin's `TenantService.createTenant` (via `TenantRepository.getLiraRate` + `createLbpCurrency`) and the public `create-tenant` edge function. A missing/invalid `LiraRate` never blocks signup — both paths fall back to `DEFAULT_LIRA_RATE = 89000`.

See gotchas #18, #19, #21, #22, #24, #36 for the snapshot/conversion rules.

---

## App Options (Global Config)

`app_options` is a **global, app-wide** key/value table (NOT tenant-scoped — no `tenant_id`). Columns: `id`, `key` (unique), `value` (text), `description`, timestamps. It holds cross-tenant configuration the SaaS owner controls. Seeded keys today:

- `LiraRate` — default USD→LBP rate (LBP per 1 USD) used when seeding each new tenant's LBP currency.
- `AllowPlanUpgrade` (`'true'`/`'false'`, default true) — when `false`, the in-app upgrade buttons (`TierCard`, `UpgradePromptModal`) are replaced by a "contact to upgrade" WhatsApp button that deep-links to `SupportWhatsAppNumber` with a pre-filled message. Purely a UX gate.
- `AllowSelfServiceSignup` (`'true'`/`'false'`, default true) — when `false`, the login screen hides the "Create organization" button **and** the `create-tenant` edge function rejects signups (`403`, `code: signup_disabled`) — server-side is authoritative.
- `SupportWhatsAppNumber` — support WhatsApp number (international format, digits only) used by the upgrade WhatsApp deep-link.

- **RLS:** `app_options_select` grants `SELECT` to **`anon` + `authenticated`** (anon is required because some flags gate pre-auth UI, e.g. self-service signup on the login screen). There is **no** write policy, so only the **service role** (SuperAdmin app + the `create-tenant` edge function) can insert/update/delete — RLS bypass is the write path.
- **SuperAdmin** owns full CRUD via the **Options** tab ([app/(tabs)/options.tsx](<../SuperAdmin/app/(tabs)/options.tsx>) → `OptionsScreen`). The `options` module mirrors `tier-plans` (repository + service + standalone `optionStore` + screen + `OptionFormSheet`) but adds create + delete. The option **key is immutable after creation** (only `value` + `description` are editable), so well-known keys can't be renamed out from under the code that reads them.
- **SubsTrack** has a **read-only** `options` module (repository `findAll`/`findByKey` + `OptionService.getOptions`/`getOptionValue` + `optionSlice` + `useOptionSlice`). It never writes. Options are fetched **at app bootstrap** (`app/_layout.tsx`, so the pre-auth login screen can read flags) and re-primed on login/restore via `primePostAuth`; they are intentionally **not** reset on `logout`. Reference keys through `OPTION_KEYS`, never magic strings. Read values through the typed selector hooks in [useOptionSlice.ts](../SubsTrack/src/state/hooks/useOptionSlice.ts): generic `useOptionValue(key)` / `useBooleanOption(key, fallback)`, and semantic `useCanUpgradePlan()` / `useSelfServiceSignupEnabled()` / `useSupportWhatsAppNumber()`. For **conditional UI**, prefer the declarative gate components in [FeatureGate.tsx](../SubsTrack/src/shared/components/FeatureGate.tsx) — `<CanUpgrade fallback={…}>` and `<CanCreateOrganization>` — which wrap the gated element and render `children` when enabled, else `fallback`; this keeps flag ternaries out of the screens. WhatsApp deep-links go through `openWhatsApp()` in [shared/lib/whatsapp.ts](../SubsTrack/src/shared/lib/whatsapp.ts).

See gotcha #38.

---

## Tenant Settings (Per-Tenant Config)

`tenant_settings` is the **tenant-scoped twin** of `app_options`: same key/value shape, but every row carries a `tenant_id`, and it is written **in-app by admins** rather than by the SaaS owner. Columns: `id`, `tenant_id`, `key`, `value`, timestamps, with `UNIQUE(tenant_id, key)`.

- **RLS:** `tenant_settings_select` lets **every member** of the tenant read (the values drive shared behavior, so a non-admin collector must see them too); `tenant_settings_write` restricts `ALL` to `admin` / `superadmin` of that tenant. Both scope on `current_tenant_id()`.
- **Module:** `src/modules/admin/tenant-settings/` — the usual repository (platform switch) + service + mapper + `TENANT_SETTING_KEYS`. `TenantSettingService` owns the **parsing** of raw strings into typed settings (`parseUnpaidStartRule`), so no caller ever inspects a raw value.
- **State:** the `tenantSettings` slice (loaded in `primePostAuth`, **reset on logout** — unlike the global `options` slice, since it is tenant-scoped and must not leak to the next tenant on a shared device). Read through [useTenantSettingSlice.ts](../SubsTrack/src/state/hooks/useTenantSettingSlice.ts): generic `useTenantSettingValue(key)` and semantic `useUnpaidStartRule()`. Reference keys through `TENANT_SETTING_KEYS`, never magic strings.
- **UI:** Admin → Tenant Settings, one section per setting (`UnpaidRuleSection`), matching `DisplayCurrencySection`'s card layout. Saving refreshes the current-month badge sets, since a rule change restates which months are unpaid.
- **Offline:** a normal tenant-scoped synced table. The offline write derives a **deterministic id from `(tenant_id, key)`** and upserts on that natural key (registered in `NATURAL_KEYS` **and** in `sync/push.ts`'s `conflictTarget`), so two devices setting the same option offline converge on one row instead of stalling the push on the UNIQUE index.

**Keys today:**

- `UnpaidStartRule` (`'month_start'` default \| `'customer_start_day'`) — when a month turns unpaid, and when the customer starts reading "Overdue". Those are **two** facts under `'customer_start_day'`: the **current** month is grey until the line's billing day (`isNotDueYet`), and **last** month is red but not yet *late* until that same day (`isNotLateYet`) — see gotcha #83. See [CLAUDE.md](../CLAUDE.md) → Critical Business Logic: Month Grid for the full rule; both helpers live in `customer-payments/utils/monthDueRules.ts`, shared by the grid and the customer-list aggregator.

**Adding a new key:** add it to `TENANT_SETTING_KEYS`, give `TenantSettingService` a typed setter + parser, add a semantic hook, and render a section on the screen. No schema change is needed — it is a key/value table.

---

## Subscription Tiers

Every tenant lives on one of three global `tier_plans` rows: **Free**, **Pro**, **Business**. The catalog is small and fixed (3 rows seeded by `script.sql`, editable by the SaaS owner via SuperAdmin's tier-plans module). Each tier defines numeric limits (`max_customers`, `max_users`, `max_plans`, `max_branches`, `max_currencies` — NULL means unlimited), feature flags (`multi_currency_enabled`, `multi_month_plans_enabled`), and a USD monthly price.

**Enforcement is service-layer.** Every feature `Service.createX()` calls `tierService.assertCanCreate(tier, usage, resource)` immediately after its existing `validate()`. Failures throw a typed `TierLimitError` (from [TierService.ts](../SubsTrack/src/modules/subscription/services/TierService.ts)) carrying `{resource, limit, tierCode}`. Slice actions catch via `instanceof` and set a structured `tierLimitError` field next to the standard `error: string`. Form sheets check `tierLimitError` and render an `UpgradePromptModal` (the existing `ErrorBanner` path stays for regular validation errors). This avoids parsing error strings.

**Tier and usage are passed in as parameters from components**, not read across slices in actions (slice actions still touch `get().subscription.refreshUsage()` after creates, but the _input_ tier/usage comes from the caller). The pattern in slices:

```ts
createCustomer: async (data, tenantId, tier, usage) => {
  set((s) => {
    s.customers.loading = true;
    s.customers.error = null;
    s.customers.tierLimitError = null;
  });
  try {
    const customer = await customerService.createCustomer(
      data,
      tenantId,
      tier,
      usage,
    );
    set((s) => {
      s.customers.items.unshift(customer);
      s.customers.loading = false;
    });
    void get().subscription.refreshUsage(); // ← cross-slice via get()
  } catch (e) {
    if (e instanceof TierLimitError) {
      set((s) => {
        s.customers.tierLimitError = {
          resource: e.resource,
          limit: e.limit,
          tierCode: e.tierCode,
        };
        s.customers.loading = false;
      });
    } else {
      set((s) => {
        s.customers.error = (e as Error).message;
        s.customers.loading = false;
      });
    }
  }
};
```

Components read `currentTier` and `usage` from `useSubscriptionSlice` and forward them into the action.

**Hydration:** `authSlice` exports an internal `primePostAuth(get, user)` helper called by `login` and `restoreSession`. It runs `get().currencies.fetchCurrencies()`, `get().branches.fetchBranches()`, `get().options.fetchOptions()`, and `get().subscription.init(tenantId)` in parallel via `Promise.all`. `subscription.init` is the **source of truth** for the active tier: it concurrently fetches the tier catalog, the tenant's usage, and the tenant row with its joined tier (`tierService.getTenantWithTier`), then writes the resolved tier back to `auth.user.tenant.tier` via `authSlice.setUserTier` so the auth slice stays in sync. This is why a tier upgrade made in a previous session is reflected immediately on app restart — the subscription slice never trusts a parameter-passed tier; it always re-queries the DB.

**Upgrade UX:** dedicated screen at [SubscriptionScreen.tsx](../SubsTrack/src/modules/subscription/screens/SubscriptionScreen.tsx) (routed at `/(app)/(tabs)/admin/subscription`). Shows 3 stacked TierCards with usage bars for the current tier and Upgrade/Downgrade buttons for the others. Upgrades are instant swaps via `subscriptionSlice.upgrade(tenantId, tierId)` — no billing wired up yet. Downgrades call `TierService.canDowngradeTo(targetTier, usage)` first; if usage exceeds the target tier's limits the dialog lists blockers ("42 / 30 customers") and refuses to swap. The `UpgradePromptModal` is also triggered inline whenever a form sheet hits a `TierLimitError`. The "Subscription" entry in the admin menu ([admin/index.tsx](<../SubsTrack/app/(app)/(tabs)/admin/index.tsx>)) is rendered only for tenant-wide admins (`user.branchId === null`) — branch-scoped admins don't see it.

**`UpgradePromptModal` design:** for tenant-wide admins, the modal renders compact preview cards for the available upgrade tiers (every tier with `sortOrder > currentTier.sortOrder`), each showing name, monthly price, and a few key perks (customer/user caps, multi-month/multi-currency flags). The footer has "Not now" + "View plans"; "View plans" pushes `/(app)/(tabs)/admin/subscription`. Branch-scoped admins and staff see a stripped-down "Limit reached — contact your administrator" notice with just a Close button (they can't change the tier themselves).

**Soft UX gates** beyond the hard service-layer block: PlanFormSheet hides multi-month duration UI when `tier.multiMonthPlansEnabled === false`; CurrencyFormSheet hides itself behind the same `assertMultiCurrency` check; the Add buttons on list screens stay enabled so the user always reaches an explanation.

**Tenant creation defaults to Free.** Both the public `create-tenant` edge function and SuperAdmin's `TenantService.createTenant` look up the Free tier id and stamp it on the new `tenants` row. SuperAdmin's `TenantFormSheet` exposes a tier dropdown so the SaaS owner can onboard paid tenants directly or change a tenant's tier later (the manual paid-upgrade path). `tier_upgraded_at` is touched on every change.

**Future-proofing:** to add Stripe, append nullable `stripe_price_id_monthly` / `stripe_price_id_yearly` to `tier_plans` and `stripe_customer_id` / `stripe_subscription_id` to `tenants`. Only `subscriptionSlice.upgrade()` changes — it redirects to a Checkout session, the webhook updates `tier_id`. Every other call site already reads from `currentTier`.

---

## Products & One-Off Sales

`products` + `services` + `sales` extend SubsTrack beyond recurring subscriptions. `payments` (subscriptions) and `sales` are deliberately separate ledgers — they don't share schema or service code. Subscription month-grid logic is untouched.

**Products** mirror `plans` exactly: per-tenant catalog, optional currency, `branch_id IS NULL` = SHARED, soft-delete via `active = false` when a product has historical sales (hard-delete otherwise — mirrors `CurrencyService.deleteCurrency`). Tier-gated through `tier_plans.max_products` (Free: 5, Pro/Business: unlimited). Soft-vs-hard delete keys off **`sale_items.product_id`** references (not `sales`).

**A sale is a header + lines, and a line sells a product OR a service.** One sale can hold **several lines** in any mix (a small "cart") — products only, services only, or both, but at least one of something. The account/transaction lives on the `sales` header; each thing sold is a `sale_items` row. This mirrors the `customers` → `customer_plans` header/line split. See **Services** below for what a service line is and is not.

- **`sales` (header)** — one transaction: `items_summary`, `total_amount`, `currency_id` + `rate_per_usd_snapshot`, `customer_id`, `recorded_by_user_id`, `sold_at`, void fields. It holds **no money and no custody**: what the sale OWES is its `charges` row (`kind = 'sale'`, written in the same transaction) and what was COLLECTED is a `collections` row — which is what lets one sale take installments. `Sale.amountPaid` still exists in the domain type but is **derived**, filled by `SaleService.withMoney` from the bill's balance.
  - `items_summary` — a **frozen** human summary of every line (e.g. `"Water ×2, Installation"`), built by the service at create time. It powers the Sales-tab **search** and the **list / debt / wallet labels** so those stay lean (no `sale_items` join needed). Contains every line's name — products and services alike — so search matches any of them.
  - `total_amount` — the summed line totals, **app-written** at create (a generated column can't sum a child table). Snapshot, never recomputed. It is also the amount of the sale's bill, so anything still owed on it is one "sale" debt for the whole sale.
  - `rate_per_usd_snapshot` — currency rate at sale time, same drift-free principle as `payments.rate_per_usd_snapshot`. Use `paymentSnapshotCurrency(sale, currencies)` to display — it works for any row with `currencyId` + `ratePerUsdSnapshot` despite the name.
  - `customer_id` is **nullable** — walk-in sales are recorded with `customer_id = NULL`.
  - `voided_at` / `voided_by` / `void_reason` for soft-void. Voiding cascades to `sale_items` only on hard delete (FK `ON DELETE CASCADE`); a void just stamps the header. No hard delete of active sales.
- **`sale_items` (lines)** — one row per thing sold: `sale_id`, `line_type` (`'product'` | `'service'`), nullable `product_id` / `service_id`, `item_name_snapshot` (frozen), `quantity` (**always 1 on a service line** — labour has nothing to count; see Services below), `unit_amount` (frozen, in the sale currency), `voided_at` (set only when an **edit** dropped the line — see below). `line_total = unit_amount * quantity` is **derived in the mapper** (no stored column). No own `branch_id` — RLS inherits from the parent sale (`EXISTS`), like `payments` inherit via the customer. `ON DELETE CASCADE` from `sales`; `ON DELETE RESTRICT` on **both** `product_id` and `service_id` (a referenced catalog row can't be hard-deleted — including by a line an edit dropped, which is why both reference counts deliberately count voided lines too). `chk_sale_items_line_ref` keeps the type and the ids agreeing: a `'product'` line has a product and no service; a `'service'` line has no product, and **may** have no service either — that gap is the one-off typed job.
  - The name column was `product_name_snapshot` before a line could be a service. The rename is guarded inside `script.sql` and needs a matching local backfill, because the SQLite mirror is additive-only — see gotcha #99 before renaming anything else it mirrors.

**One currency per sale, auto-convert.** A sale freezes exactly one currency + one rate (the debt / wallet / dashboard math depends on it). The `SaleFormSheet` has a single sale-currency selector; when a catalog item (product **or** service) is added, its price is **converted into the sale currency** at the live rate (`convert()` in `src/core/utils/currency.ts`) as the editable per-line prefill. The first catalog item picked adopts its own currency as the sale default (until the user changes it); changing the sale currency re-prices every catalog line from its own price — a **one-off** service has no catalog price, so its typed amount is left alone. The `SaleItemsEditor` (`src/modules/transaction/sales/components/`) owns the cart rows + sale currency and reports a `SaleCartDraft` (`lines` / `total` / `currency` / `ready` / `dirty`) up to the form — mirroring `CustomerPlansEditor`'s add/remove-row pattern. An optional `initial` seeds it from a saved sale (edit mode). It answers `dirty` **itself** rather than letting the form diff its values: it re-reports the draft from an effect one render after mount, so `useDirtyForm`'s baseline would be the empty cart and an untouched edit form would prompt "discard changes?" on close (gotcha #55). The editor owns the baseline, so it owns the answer — and its signature covers `lineType` / `serviceId` / the typed name too, or flipping a row to a service would read as untouched.

**Create is header-then-lines.** `SaleService.createSale` computes the summed `total_amount` + `items_summary`, then `SaleRepository.create` inserts the header, then the lines (web: sequential insert like the customer + `customer_plans` path; offline: header + all lines in one SQLite transaction, pushed parents-before-children via `PUSH_WAVES`). List/detail reads join `sale_items(*, products(*), services(*))` — both LEFT joins, since a line fills at most one of them; the lean aggregate/label reads (`partialSales`, `heldForWallet`, dashboard totals) read only header columns.

### Services

A **service** is labour the tenant charges for — an installation, a repair visit, a router setup. Before this existed the only way to bill for one was to invent a fake product, which dragged it through the stock ledger and the derived stock expenses where it does not belong.

**What a service is:** a **line on a sale**. There is no service record, no Services tab, and no fourth money stream. That is the design, not a shortcut: every money figure in the app reads the sale's **one bill**, so services arrived in revenue, debts, the collector wallet, Reports, WhatsApp invoices and the CSV export with **no new aggregation anywhere**. Read gotcha #98 before adding a "services revenue" figure — a mixed sale raises one charge, and splitting the cash against it between goods and labour is a number the business never agreed to.

**What a service is NOT:** stocked or costed. No `stock_movements` row, no oversell check, no expense. Staff pay is still typed by hand under the `salaries` expense category. Because a service line moves no stock, every stock path narrows through `productLines()` / `savedProductLines()` in `sales/utils/saleLines.ts` — never a nullable-id test (gotcha #97).

**The price list (`services`).** Admin → Services, reached from the admin menu. The products screen minus stock and cost: name, description, price + currency, branch (`branch_id IS NULL` = SHARED), `active`. `UNIQUE(tenant_id, branch_id, name)` and the RLS pair `services_select` / `services_modify` are copied from `products` verbatim — so a **collector** can add one from the sale form the same way they can add a product, and a branch-scoped user can only write in their own branch. **No tier limit** (unlike `max_products`): services are uncapped. Soft-delete when any sale line references it (counting voided lines, since the FK is `ON DELETE RESTRICT`), hard-delete otherwise — the same two-mode `deleteService` as products, with a batch counterpart. Audited like products, with **History** on the card menu via `useRecordHistoryAction('services')`.

Layers: `src/modules/admin/service-catalog/` — repository (+ `.offline`, platform switch), `ServiceCatalogService`, `ServiceListScreen`, `ServiceCard`, `ServiceFormSheet`, and a `services` slice with the standard `loaded` guard. The business-logic class is named `ServiceCatalogService`, not `ServiceService`, because "service" is also this app's name for that whole layer — and the module folder is `service-catalog` so the file is not `admin/services/services/…`.

**Picking one on a sale.** A line's kind is decided by **which button added it** — the cart footer holds two dashed buttons, **+ Add product** and **+ Add service** — and the card then only *labels* what it sells (icon + word, plus `#n` when there are several). There is **no per-row switch**: the first shape of this editor put a full-width `Product | Service` segmented control at the top of each card, which read as a page tab bar, so tapping "Service" looked like navigating to a services list and instead silently wiped the product the user had just picked (gotcha #101). A sale holding both is therefore **two lines, never one line toggled twice**, which is also what the data model always said. A new sale opens with **zero** rows — the two buttons are the empty state — and any row, including the last, can be removed, which is how a line's kind is changed. In a service row the dropdown offers the active catalog services (priced in the sale currency, same conversion as products) plus a final **"Other — type a name"** option, which reveals a name field: that is the **one-off** — `service_id IS NULL`, and `item_name_snapshot` is the entire record of what was sold, so no catalog row is created. Adding a service inline (the dropdown's "+") prices the row from the object the form just saved, not from a store lookup, which would miss it on that render.

**A service line has NO quantity — only a price.** No stock cap, no "N left" caption, and **no stepper at all**: labour is one job at one price, so the row shows a single **Price** field which *is* the line total. Two jobs are two lines; a bigger job is a bigger number. This is enforced by the type, not by a runtime check — the `service` variant of `CreateSaleItemInput` simply has no `quantity` field, so the compiler stops any caller from multiplying one. `lineQuantity()` (`sales/utils/saleLines.ts`) is the one answer to "how many?", returning 1 for labour, and every total, summary and DB row goes through it: `sale_items.quantity` still exists and still stores **1** on a service line, so nothing downstream had to learn a special case. The receipt and the WhatsApp invoice both drop the `1 × …` prefix on a service line, because "1 × $25 = $25" is noise.

**Validation** splits by kind in `SaleService.validate`: a product line needs a real catalog row (`errors.sale_product_required`) **and** a positive integer quantity, a service line needs a non-blank resolved name (`errors.sale_service_required`) — which is also what keeps the `NOT NULL` name column legal for a one-off — and no quantity rule at all. The positive `unit_amount` check is shared.

**Edit an existing sale.** A recorded sale can be corrected in place — "I rang up the wrong product / quantity / price" no longer means void + re-record, which lost the receipt id and left a dead row in the trail. **Any staff member** may edit, from the sale row's **3-dot menu** or the receipt sheet's **Edit sale** action (all three sale surfaces: the Sales tab, the customer panel, the per-customer page). It reuses **one form** — `SaleFormSheet` takes an optional `sale` prop and switches title, button and submit path; there is no second edit form. A **voided** sale is a closed record and never offers the action (`SaleService.updateSale` refuses it, and both repositories filter `voided_at IS NULL`).

Everything the form owns can change: the lines (including swapping a product line for a service one, or the reverse), quantities, unit prices, the sale currency, the customer, the amount collected and the notes. What identifies the sale cannot: `id`, `tenant_id`, `sold_at`, and the original `recorded_by_user_id` (who made the correction is in the audit trail, not on the row). Five rules make it safe:

- **Changing the currency RE-FREEZES `rate_per_usd_snapshot`**, exactly like editing a payment (gotcha #21) — the corrected row is what every historical USD total then reports.
- **The stock ledger is swapped, not reversed.** `SaleRepository.update` soft-voids the sale's live `'sale'` movements and inserts fresh ones — the same idempotent shape as `voidSale`, never compensating opposite rows (gotcha #48). It only happens when the **per-product** unit count actually changed: `SaleService.sameStockFootprint` compares the carts by product, so a price / notes / amount-paid fix leaves the ledger untouched (and splitting one line of 3 into 1 + 2 moves nothing, so it doesn't either). **Service lines are invisible to that comparison on both sides**, so a service-only edit compares two empty footprints and correctly leaves the ledger alone; replacing the last product line with a service yields an empty replacement set, which voids the old movements and inserts none — giving the stock back exactly once (gotcha #97).
- **The sale's own units count as available while it is being re-cut.** `assertStockAvailable` takes a `credited` map (and `SaleItemsEditor` a matching stock credit), so re-pricing a sale that took the last unit isn't rejected as out of stock, and the cart's "N left" caption shows the true ceiling. The editor also keeps a product that was **deactivated** since the sale on its line — otherwise the edit couldn't re-save the line it is standing on — while barring it from a new one.
- **A dropped line is soft-voided (`voided_at`), never deleted.** The sync engine has no tombstones for `sale_items`, so a delete would live on forever in every other device's mirror. Lines are matched to the existing rows **by position**, so a line that merely changed quantity or price keeps its id and syncs as a plain update. `mapDbSaleToSale` filters voided lines out — the one place both the web and the offline read pass through — and the Sales-tab product filter skips them too.
- **A walk-in edit keeps the sale's branch.** The create rule (`customer.branchId ?? user.branchId`) would move a collector's branch sale to "no branch" the moment a tenant-wide admin corrected a typo in it, so an edit falls back to `sale.branchId` instead.

An edit **re-prices the bill and leaves every payment against it alone** — money is a `collections` row with its own date, collector and custody, so correcting it means voiding that payment, not re-typing a number here. The form shows the collected amount read-only and refuses a total below it (`errors.sale_total_below_collected`); the service refuses it too. There is **no custody lock** — a sale stays editable after its cash has been handed up the chain. One audit entry is written for the sale as a whole (`action: 'update'`, changed columns only) — `sale_items` and `stock_movements` remain deliberately un-audited, and the changed `items_summary` / `total_amount` are what report a re-cut cart.

**Receipt (`SaleDetailSheet`).** The lines get their **own card**, separate from the customer / sold-at / receipt-ID rows: an "Items" header (cart icon + line count when >1), then one row per line — numbered bubble, `item_name_snapshot` (a **service** line prefixed with a small `construct-outline` mark, so the bill shows at a glance which part was labour), a `qty × unit price` sub-line, and the line total on the right. A totals footer (Total, plus Paid / Remaining when the sale is partial) renders only when it adds information (multi-line or partial sale). The hero's caption swaps the frozen `items_summary` for a "{{count}} items" count once there is more than one line, since the summary gets long. Lean reads (empty `items`) simply skip the card.

Below the lines the receipt shows **every payment that reached the sale** — the same `BillPaymentsList` the month bill sheet uses, fed the sale's own `chargeId` and currency snapshot. A sale and a month are one `charges` row to the ledger, so a sale paid in installments deserves the same running record: one row per hand-over with its amount *against this sale*, its date, its collector, an "also paid other bills" note when the cash was wider than this record, and a 3-dot menu offering **Send on WhatsApp** (customer + phone only) and **Void payment**. Voiding one there refreshes the screen behind, so the sale reads as owing again. A lean read carries no `chargeId`, so the block is not rendered and nothing is fetched.

**Row actions (`useSaleActions`).** Every sale row carries a **3-dot menu** holding everything one sale can do, so no action is reachable only by opening the receipt first: **View receipt · Edit sale · Complete · Send invoice on WhatsApp · History · Void sale**. A **voided** sale keeps only the two that still make sense (view + history) — void is final, so it is never editable, re-sendable or voidable again. The WhatsApp row stays **visible and disabled with a caption** when there is nobody to send to (walk-in) or no phone on the customer, the same "explain, don't vanish" rule the invoice selection action follows.

**Collect** appears only while the sale still owes something and has a customer (a walk-in has nobody to chase). It opens the very same `CollectSheet` every other bill uses — one door for money in, so custody, the audit entry and the currency rules are written in exactly one place. The old **Complete** action is gone with the model that needed it: `amount_paid` had no date of its own, so "he really paid in full, it was written down short" could only be expressed by rewriting the number. Now the second payment is simply recorded, on the day it happened. The hook takes an `onCollected` callback carrying the created `Collection`, and the sale form's `onCreated` / `onUpdated` carry the saved `Sale` — a list that keeps its own state (the two customer-scoped ones) patches itself from the row. The Sales tab needs neither: `ledger.collect` fans the hand-over out to `sales.applyCollection`, and the slice patches its own list and month totals on every write (gotcha #116).

The whole set is defined **once**, in `sales/hooks/useSaleActions.tsx`, and used by all three sale surfaces (Sales tab, customer panel, per-customer page) — adding an action means one edit, not three. The hook owns the `ActionMenu`, the shared-reason void dialog and the record-history sheet; the screens keep the receipt sheet and the sale form, since those carry each screen's own refresh callback. Two deliberate choices inside it:

- **One menu per SCREEN, not per card.** The debts / expenses cards each mount their own `ActionMenu`, but the sales lists are paginated and virtualized, so a per-card menu would mount a bottom sheet per visible row. `SaleCard` only raises `onMenu(sale)`.
- **One void dialog for one sale and for a selection.** `requestVoid(sales)` feeds the same `SaleBulkVoidSheet` from the card menu and from the multi-select toolbar, so a single-sale void gets the same reason box and the same `voidSales` path (its title/message have `_one` plural forms so the copy reads right for one row).

**Branch semantics:**

- `products.branch_id`: same as `plans` — `NULL` = SHARED catalog item visible to every branch.
- `sales.branch_id`: same as `customers` — `NULL` only when a tenant-wide admin records a walk-in without picking a branch. RLS scopes branch-scoped users to their own branch. `sale_items` has no `branch_id` — it inherits via the parent sale.

**`AsyncEntityPicker`** ([src/shared/components/AsyncEntityPicker.tsx](../SubsTrack/src/shared/components/AsyncEntityPicker.tsx)) is the reusable customer picker built for `SaleFormSheet`. Generic over `<T>`; the caller passes a `loadPage(search, page)` callback. Reuses `SearchTextBox`, `useDebounce` (300 ms), and a `requestToken` ref to discard stale responses when the user types fast (same pattern as `customerSlice.searchToken`). Use it any time the option list is too large to fit in memory — small static lists keep using `Dropdown`.

**Sales tab filters:** `SalesPanel` exposes a chip filter bar above the list — search (sale `items_summary` + customer name), customer (`CustomerPicker`), product (`Dropdown` over active products, lazy-loaded via `fetchProducts` on mount — the repo resolves "sales containing this product" from `sale_items`), and a **From/To date range** (`DatePickerInput` with `triggerStyle="chip"`, the two pickers constrain each other via `minDate`/`maxDate`). All non-search filters live on the `sales` slice (`customerFilter`, `productFilter`, `fromDate`, `toDate`) and flow into `saleService.getSales` → `SaleRepository.findAll`; date bounds are calendar days converted to `sold_at` timestamp bounds (end inclusive via next-day-exclusive). A "Clear filters" chip (visible only when ≥1 filter is active) resets them in one tap via `clearFilters`.

**Customer sales surfaces:** the customer detail screen renders `CustomerSalesPanel` at the **bottom** (below the payment grid + details card). The panel shows only a **5-sale preview**; when the customer has more it renders a "Show all" link to a dedicated full-page list (`CustomerSalesListScreen` at `customers/[id]/sales`) that mirrors the Sales tab (search + infinite scroll + record FAB + void) but is locked to one customer. Both surfaces keep their **list reads** independent of the global `sales` slice — the panel via `saleService.getSalesForCustomer` (with a stale-response token guard), the full page via the `useCustomerSalesList` hook — so neither clobbers the Sales tab's filter/search/list state. **Mutations, however, route through the global slice** so the Sales tab cache stays coherent: creates go through `SaleFormSheet` → `saleSlice.createSale` (unshift), and voids go through `saleSlice.voidSale` (drops the row from `sales.items`); each surface then refreshes its own local list. Neither surface applies a branch filter: they show **all** of the customer's sales regardless of the admin's current branch view.

Both customer surfaces also carry **multi-select → one WhatsApp receipt** (`useSaleInvoiceAction`): long-press a card to enter selection, tap to tick, and the send action builds a single receipt for the whole selection. The full page uses the page-header `SelectionBar` (with select-all); the **preview panel** swaps its own title row for an `InlineSelectionToolbar` with **no select-all** — five rows don't need one — inside a fixed-height (`h-9`) wrapper so entering selection can't shift the cards under the finger that long-pressed one, and it hides "Show all" while selecting. Its selection is cleared by every `refresh()`, because a new sale can push a ticked row out of the 5-row preview. Bulk **void** stays on the full page and the Sales tab only.

**Dashboard:** `DashboardService.getMetrics()` makes **one** cash read — `collectionService.collectedInRange` — plus a plain `saleService.countInRange` for the activity count. The Revenue card shows `monthlyRevenue = subscriptionRevenue + salesRevenue + manualRevenue`, with a breakdown sub-line listing only the non-zero streams. All three come from the SAME rows, split by what each one settled (`charges.kind`), so unlike the old three-query version **they add up to the total exactly**. Everything is summed in USD via each row's frozen `rate_per_usd_snapshot`, then formatted into the display currency at render.

**Revenue is CASH COLLECTED, not billed value** — and now there is only one place it can come from: `collection_items`, by `collections.received_at`. A partial payment contributes only what arrived; the remainder is a debt and enters revenue in the month it is collected, so every unit of money is counted exactly once and nothing collected is lost. Reading from the **item** side is what fixed the old breakdown: a payment against a sale debt used to land in a "debts" bucket, so sales revenue under-reported. `salesCount` is still every sale row, paid or not (`SaleRepository.countInRange`) — only the money is cash-based. Do **not** switch any revenue query back to `sales.total_amount` or `charges.amount`.

**Home analytics (expanded).** `getMetrics()` also computes a richer analytics set, all branch-scoped and USD-canonical:

- **Month-over-month** — `prevMonthRevenue`, the dashboard's only comparison figure (there is **no revenue chart**: it was removed along with `RevenuePoint`, `getRevenueTrend` and the slice's `trend` state). The hero card renders a ▲/▼ % pill ("vs last month") when the prior month had revenue. Built by `DashboardService.getMonthCollections(year, month, branchFilter)` — one private helper that returns a month's collected cash split by what it settled (plus `paymentsCollectedCount` / `salesCount`), and the **only** place the revenue query is issued: `getMetrics()` calls it twice inside its own `Promise.all` (this month for the breakdown, `month - 1` for the pill), so both figures come from the **same read**, scoped by **when the money arrived** (`collections.received_at`, never `billing_month`) — the pill compares like with like by construction, not by two code paths agreeing. `Date` normalizes month 0 into last December, so January needs no special case.
- **Growth this month** — `newCustomersThisMonth` / `cancelledThisMonth` via `customer.countCreatedInRange` / `countCancelledInRange` (by `created_at` / `cancelled_at`, `[monthStart, monthEndExclusive)`).
- **Activity this month** — `paymentsCollectedCount` (positive-amount rows in `paidAmountsForMonth`, scoped by `paid_at`) and `salesCount` (`totalsForMonth` row count). The screen derives **avg payment** = `subscriptionRevenue / paymentsCollectedCount`, shown as the "Payments" tile sub-line.
- **Total debt tile** — the one figure on the dashboard that is **all-time, not month-scoped** (it answers "how much is still outside", which has no month). `totalDebt` comes straight from `ledgerService.getDebtsView().summary.totalUsd` — the same number as the Debts screen header. Its sub-line breaks it down by kind (`monthsDebt` / `salesDebt` / `manualDebt`), and **these now sum to the headline exactly**: every row carries its own balance, so there is no gross-vs-net split left to explain. The old mismatch (and the reverted attempt to reconcile it) died with `debt_payments`.
  - `totalDebt` **also appears inside the purple hero card** as a red-tinted chip (`bg-red-400/20`, matching the card's decline pill) prefixed with a minus — `Owed by customers −$383.00` — shown only when `totalDebt > 0`. It sits below the revenue breakdown, sharing a wrapping row with the orange `Expenses $X` chip. **Only the red chip carries a minus** — spending prints unsigned, the same way `outflowLabel()` prints it on the Expenses tab, so the two screens never disagree about the sign of a cost. The tint + minus are load-bearing: everything else in that card is money **collected**, so the one figure that is money **not** collected has to read as an outflow at a glance. The tile below keeps the reconciling category breakdown; the chip is the glance-value.
  - The hero's revenue breakdown lists **Subscriptions and Sales** (and hand-typed fees when there are any). The old "hide collected debts from the breakdown" rule is obsolete: money is now filed under **what it paid for**, so cash that settled a sale debt appears under Sales — where the owner would look for it — instead of in a second debt figure beside the one that says what is still owed.
  - So the card carries **money in** (big number + streams) and **money out** (the chips) together, and they never mix: collecting a debt raises the total and lowers the red chip.

**The hero card is its own component** — `dashboard/components/RevenueHeroCard.tsx`. It owns every figure printed on the purple card and derives them itself (the month label, the ▲/▼ pill, the revenue mix, the two outflow chips, the collection bar), so the screen hands it only `metrics`, `fmt`, `showExpenses` (admin **and** something was spent — the same flag that reveals the two money-out tiles below) and an `onPress`. **Tapping the card opens the Reports tab**, and a "Reports ›" pill in its top-right says so; both the dashboard and Reports are admin-only tabs, so anyone who can see the card can open it. Without `onPress` the card renders as a plain `View` — no pill, no press feedback. Layout is flat panels rather than divider rules: the revenue mix and the Net row each sit in a `bg-white/10` inset (the old `bg-indigo-500` dividers were invisible, since `bg-primary` **is** indigo-500).

Presentation: the screen uses a shared `StatTile` (label / big value / sub-line / tone / optional icon) for the stat grid (Active, Unpaid, New, Cancelled, Payments, Sales) and the total-debt money tile. Every repo range query has a Supabase + Offline SQLite implementation behind the `ICollectionRepository` / `IChargeRepository` / `ISaleRepository` / `ICustomerRepository` seam.

**Tier-gating** is sale-blind: products consume a slot (gated by `max_products`), but recording sales is unlimited on every tier. Stock is not gated at all — restocking is unlimited.

### Stock

Every product carries a stock quantity and can be **out of stock**. Stock on hand is **computed at runtime** — `Product.stockOnHand = SUM(stock_movements.quantity_delta)` over the non-voided rows — exactly like Debts and the Collector Wallet. There is deliberately **no counter column on `products`**: the offline sync pushes whole rows with latest-`updated_at`-wins, so two devices each selling one unit offline would both write the same decremented number and one sale would vanish. Additive ledger rows merge with no conflict.

**`stock_movements`** — `product_id`, signed `quantity_delta` (never 0), `reason`, `sale_id` (only for `'sale'`), `unit_cost` + `currency_id` + `rate_per_usd_snapshot` (what the stock cost to BUY — see below), `note`, `recorded_by_user_id`, `occurred_at`, plus soft-void fields. Reasons:

| Reason | Written by | Sign |
| --- | --- | --- |
| `initial` | the "Starting stock" field on **product create** | + |
| `restock` | the product's stock sheet, "Add" — or the **batch restock** sheet | + |
| `adjustment` | the product's stock sheet, "Remove" (damage, miscount, wrong entry) | − |
| `sale` | `SaleService.createSale`, one row per line | − |

**Reading it.** Web reads the `product_stock` view — `SUM(quantity_delta) … WHERE voided_at IS NULL GROUP BY product_id, tenant_id`, declared `WITH (security_invoker = true)` so the caller's RLS on `stock_movements` still applies (**requires PG 15+**; without `security_invoker` the view runs as its owner and leaks every tenant's stock). Offline runs the same `GROUP BY` on the mirror — there is no local view. Both are `IProductRepository.stockOnHand(ids?)` returning `Record<productId, number>`; products with no movements are absent and default to 0. `ProductService.getProducts` folds the map into each `Product`.

**Branch scoping is inherited from the PRODUCT, not the sale.** The `stock_movements_all` policy mirrors `products_select` (`current_branch_id() IS NULL OR p.branch_id IS NULL OR p.branch_id = current_branch_id()`) — **not** `sale_items_all`, which inherits `sales`' *owned* semantics. Copying `sale_items_all` would hide every SHARED product's movements from a branch-scoped user, so each shared product would read as permanently out of stock and be unsellable for them. A shared product has **one** stock pool across all branches. The `WITH CHECK` also allows shared products (unlike `products_modify`): a branch user who can *sell* a shared item must be able to write its movement.

**Writing it.**

- **Sale create** — `SaleService.createSale` builds one negative `'sale'` movement per line and passes them in `CreateSalePayload.movements`. The repository writes them alongside the header + lines (offline: the *same* transaction), so a sale can never exist without the stock it consumed.
- **Sale void** — the sale's movements are **soft-voided** (`UPDATE … WHERE sale_id = ? AND voided_at IS NULL`), not reversed with opposite rows. One statement, independent of line count, and idempotent — a repeat void is a no-op instead of returning the stock twice. Bulk void inherits this for free (`saleSlice.voidSales` loops `saleService.voidSale`).
- **Manual** — `ProductService.addStock` appends a single `restock` row. **A manual entry only ever ADDS** — there is no "remove from stock" form: a delivery that was mistyped, never arrived, or was logged twice is fixed on the entry that recorded it (see [Editing a stock entry](#editing-a-stock-entry) and [Reverting a stock entry](#reverting-a-stock-entry)). A row is never deleted, and a `'sale'` row is never touched by hand.
- **Batch restock** — `ProductService.restockMany(entries, tenantId, note, userId)` appends one `restock` row **per product** in a single `addMovements` call (offline: one transaction), then returns the fresh on-hand map so `productSlice.batchRestock` updates the list without a refetch. One arriving delivery = one save, but the per-product history stays exactly as detailed as the one-at-a-time path — there is no "batch" reason and no grouping row. The shared note is copied onto every row.

**Blocking.** `SaleService.createSale` calls `assertStockAvailable` after `validate()` — a **fresh** `stockOnHand` read (the store can be minutes stale), summing the requested quantity **per product across all cart lines** (the same product can sit on two rows). Throws `errors.sale_out_of_stock` / `errors.sale_insufficient_stock`. Because it lives in the service, every entry point is covered (sale form, quick actions, customer screens). `SaleItemsEditor` mirrors it as a soft guard: out-of-stock products stay listed but greyed via `DropdownOption.disabled`, the quantity stepper caps at *on-hand minus what other rows already took*, each row shows "N left", and an oversold cart reports `ready: false`. The check is **advisory** — two offline devices can still each sell the last unit, and the DB deliberately allows a negative total (gotcha #48).

**UI.** `ProductCard` shows a green "N in stock" / red "Out of stock" / red "Short by N" chip. `ProductStockSheet` (product row menu → "Adjust Stock", or the link on the edit form) shows the current on-hand, a quantity + cost + note that only ever adds, and the last 20 movements as a bordered list: a reason icon tinted by direction (green adds / red removes), the reason, date **and** time (`formatDateTime`), who recorded it (resolved from the users slice via `recordedByUserId`), the note, a **3-dot menu** on every correctable row (Edit entry · History), and a "Reversed" chip with struck-through amount on voided rows. An amber line warns when the save would push stock **below zero** — it never blocks, because the DB accepts a negative total on purpose (gotcha #48). `ProductFormSheet` takes "Starting stock" on **create only**; on edit it renders the number read-only next to an "Adjust Stock" link, so the total is never free-typed.

`ProductBatchRestockSheet` is the many-products counterpart: a search box, then every **active** product as one compact row — name, current on-hand, and a `[−] qty [+]` stepper. A row with a quantity turns indigo and previews the result (`3 → 8`), so what's included is visible without reordering the list while the user types. One shared note applies to every row, and a summary line ("N products selected · +40") sits above the save button. Quantities are held per product id, so filtering the list never loses what was already typed. Two entry points, one component: the **Restock** button beside the search box on the products screen, and **Batch Restock** in the PageHeader quick-actions menu (admin-only there, since products live in the admin tab that non-admins never see).

**Cost — the money side of the ledger.** A movement can carry what one unit cost to buy: `unit_cost` + `currency_id` + `rate_per_usd_snapshot`, written together by `ProductService.movement()` or all three null. That is the **only** money on `stock_movements`, and it is what makes buying stock an expense (see [Expenses](#expenses)). `products` also gained `cost_price` + `cost_currency_id` — a *default* that pre-fills the restock forms, live like `price` and never frozen; each delivery freezes its own cost on its own movement. Everything is optional: a restock with no cost still records the stock and simply adds no expense, which is also what every legacy row does. A `'sale'` movement never carries a cost (stock leaving is not money leaving) — `movement()` enforces that one.

**Cost is typed in three places:** the product form's **Cost price** field (the default, plus the opening stock's cost on create), the stock sheet's **Cost per unit** / **Total cost** pair (see below), and the **batch restock** sheet, where one **delivery currency** is picked for the whole save and each picked row opens a cost line seeded from its product's cost price, converted at the live rate (the `SaleItemsEditor` rule — changing the delivery currency re-prices every row). The stock history shows a costed row's money ("Cost: $X", or green "Money back: $X" on a negative row), so which rows moved Expenses is visible.

**A stock expense comes back down through the ENTRY, never through a second row.** `amount = quantity_delta × unit_cost`, so a *negative* costed row is a negative expense — a credit — but **no new one can be written**: the stock sheet has no Remove mode, so the two doors are **Edit entry** (the row says 12, the delivery was 10) and **Revert entry** (the row should never have existed). Both take the money off the **entry's own month**, which is what a mistyped delivery needs — correcting a July delivery in August drops July's expense and leaves August alone. The credit shape stays supported for the negative rows older data already holds, and for editing one of them; it is simply not something staff can create any more.

**What has no door any more:** stock that really left later — damaged, lost, stolen, or returned to the supplier. Those were the empty-cost and the costed *removal*, and both went with the Remove mode. The count now comes down only by selling, or by editing the entry that put the units there — which rewrites that entry's own month instead of recording a later event.

**Per unit or per delivery — both are typeable, and each fills the other.** A supplier invoice states one or the other ("4.50 each", "45 for the lot"), so the stock sheet puts **Cost per unit** and **Total cost** side by side: typing either one recomputes the other from the quantity (`total = unit × qty`, `unit = total ÷ qty`). Only **`unit_cost`** is ever saved — the total is a way of entering it, not a column — so the derived unit keeps **8 decimals** (what `stock_movements.unit_cost` stores): rounding 100 ÷ 3 to 33.33 would make the recorded expense 99.99 and disagree with the invoice that was typed. **The last field staff typed is the anchor**, so changing the quantity afterwards recomputes the *other* one and never overwrites what they entered — typed a 45 total, then fixed 10 units to 12, and the unit becomes 3.75 while the total stays 45. Everything else keeps the per-unit field as the source of truth: an abandoned edit and picking Edit on a row both reset the anchor to "unit". One currency for both — the picker sits on the per-unit input and the total is locked to it, since a movement stores one currency.

#### Editing a stock entry

A **manual** movement can be corrected in place — `ProductService.updateMovement` → `IProductRepository.updateMovement`, reached from the history row's 3-dot menu → **Edit entry**. It is one of the **two** doors into "the stock number is wrong"; the other is [Reverting a stock entry](#reverting-a-stock-entry):

| | **Edit the row** | **Revert the row** |
| --- | --- | --- |
| What happened | the entry was **written** wrong (12 typed for a 10-unit delivery, a cost of 0.50 the invoice says was 0.45) | the entry should **not exist** at all (logged against the wrong product, saved twice) |
| The history says | 10 arrived | the row stays, struck through and chipped "Reversed" |
| The month that moves | the entry's **own** month — July becomes $5.00 | the entry's **own** month — July's $6.00 goes away |

Both look backwards, and that is now the whole story: a manual entry cannot *remove* stock, so "12 arrived, then 2 went back" is a shape the ledger no longer writes (it did until this change — gotchas #94 / #96 keep the reasoning, and older data can still hold such a row).

**What may change, and what may not.** Only **quantity**, **cost + currency** and **note**. `occurred_at` is locked (it is what decides which month the money counts in — moving it is what the two-doors rule exists to avoid), and so are `reason`, `product_id` and the row's own identity. `UpdateStockMovementPayload` is the type that says so.

Four guards live in the **service**, so every future caller inherits them:

- a `'sale'` row is refused (`errors.stock_movement_sale_locked`) — `SaleService` swaps a sale's movements when the sale is edited, so a hand-edit would leave the sale saying 3 sold and the ledger saying 1;
- a **voided** row is refused — it is already dead;
- the quantity arrives as a **magnitude**, and the sign is taken from the existing row, so a correction can structurally never turn stock added into stock removed (that is a new event, not a fix);
- **oversell is not blocked**, only warned about in the sheet — editing a delivery of 12 down to 10 after 11 were sold lands on −1, and negative stock is legal by design (gotcha #48).

**The rate only re-freezes when the cost actually moved.** Changing the amount or the currency re-snapshots `rate_per_usd_snapshot` at the live rate (the payment/sale edit rule, gotchas #21 / #90); editing only the quantity keeps the old rate, or a 2-unit fix would silently re-value a months-old purchase at today's rate. `ProductService.costFields()` is the one place that builds the cost trio, shared with `movement()`.

**Editing is why `stock_movements` is now audited** — see [Audit Trail](#audit-trail). Nothing else would remember that the row once said 12: the ledger is the only record of a manual movement, and an in-place edit overwrites it. Only an **edit** or a **revert** writes an audit entry (the insert would just duplicate the stock history), the entry is filed under the parent **product's** branch and name (`auditedUpdate`'s new `audit` option — a movement owns neither), and the same trail is readable from the row's own **History** action.

**UI.** One form does both jobs, like `SaleFormSheet`: picking Edit fills the sheet's quantity / cost / note from the row, puts an "Editing this entry" banner above it (direction locked, with a Cancel ✕ and a one-line note on when an edit is the wrong tool), and turns the button into "Save Changes". The tapped row sits far below the form, so picking Edit also **scrolls the body back to the top** (`scrollBody.current?.(0)`, the handle `FormSheet` fills through its `scrollRef` prop — a ref and not a context, see gotcha #102) — otherwise the filled fields and the banner stay off-screen and the action looks like it did nothing. Saving **keeps the sheet open** and reloads the history — a correction is only believable next to the rows it fixed — and resets the form to its first-render state so the unsaved-changes guard stays quiet.

#### Reverting a stock entry

The edit door's sibling, for when the entry should never have existed at all — a delivery logged against the wrong product, a duplicate save, an adjustment somebody typed on the wrong row. Reached from the same 3-dot menu (**Revert entry**, red, last), behind a confirm dialog, and open to **any staff member** like the edit.

**It is a soft-void, not a row deletion.** `voided_at` + `voided_by` are set, and both derived numbers fix themselves: the row leaves the stock sum (`product_stock` / the mirror's `GROUP BY` count only live rows) and, if it carried a cost, it leaves Expenses. The row stays in the history, greyed out with the "Reversed" chip that a sale-voided movement already wears — hard-deleting it would take away the only answer to "where did the other 12 bottles go", and the ledger is deliberately a record of what staff did, not just of the current total (rule 7, no hard deletes).

**The month is the entry's own, exactly like an edit.** Reverting says the entry was never real, so the money comes off the month the entry belongs to: a July delivery reverted in August leaves August untouched and drops July's expense. There used to be an opposite door — a costed *removal*, which credited the month it was recorded in — but the stock sheet's Remove mode is gone, so only older data holds such a row (see [Stock](#stock) → cost, gotchas #94 / #96).

**Refused for the same rows an edit is refused for, in the SERVICE.** `ProductService.revertMovement` and `updateMovement` share one guard — `liveManualMovement(id)` — so a `'sale'` row (its movements belong to the sale, which swaps them itself) and an already-reverted row are turned away wherever they are called from, not merely hidden in the menu. `stock_movements.voidMovement` is the one write, audited as a **`void`** with the parent product's branch and name, so "who reverted this and when" is answerable — and the reverted row's menu keeps its **History** action for exactly that (Edit and Revert are gone; a `'sale'` row still opens no menu at all).

**UI.** The confirm dialog names the entry ("Stock added +12 will stop counting…") and says what happens to the totals. On success the sheet stays open and reloads the history, so the "Reversed" row is visible immediately, and a form still filled from that row is reset — otherwise Save Changes would sit there pointing at an entry that no longer counts.

See gotchas #35, #36, #37, #48, #88, #89, #94, #96.

---

## Reports

The Home dashboard answers one question — "how is **this month** going?" — with fixed tiles for one fixed period. The Reports tab answers "how is the business going, over any period I choose". It is a small number of curated sections, not a query builder: an ISP owner reads them, not a data analyst.

**Admin-only**, the same gate as Expenses and the dashboard — the tab is hidden with `href: isAdmin ? undefined : null`, so the route is not even in the tab bar for a collector.

### The page

`PageHeader` (with the branch chip and a CSV export button) → `PeriodPicker` → a `SegmentedTabs` section switcher → the section's cards. Phase 1 ships **Money** and **Debts**; Customers and Staff/Products are phase 2 and drop into the same shells.

**Period** (`src/core/utils/dateRange.ts`) is one primitive: `ReportPeriod { preset, fromDate, toDate }` with presets *This month · Last month · Last 3 / 6 / 12 months · This year · Custom*. Every preset is **whole calendar months** — it always ends on the last day of its final month — so its buckets and its comparison window are the same shape. `previousPeriod()` shifts a month-aligned period by whole months and anything custom by its own day count. The file also holds the app's `dayStartIso` / `nextDayStartIso` / `rangeFromDays` helpers, which four repositories and the expense slice used to carry privately.

### Money

| Block | What it shows |
| --- | --- |
| KPIs | Collected · Spent · Net · Margin, each with a ▲/▼ pill vs the previous period of the same length |
| Money in | Breakdown by stream, with an inline share bar |
| Money out | Breakdown by expense category (including the derived `stock` half) |
| Collected by currency | What was **physically** collected in each currency, each printed in its own currency with a `≈` display-currency value beside it |

### Debts

| Block | What it shows |
| --- | --- |
| KPIs | Still owed (**all time**) · Collected on debts (**this period**) · Customers owing · Behind on payments (**counted to today**, so this one does not move with the period) |
| Who owes the most | Top 10 debtors, each with how many months they are behind, tappable through to the customer |
| What is owed for | Gross by debt category (months / sales / custom) |

Only one figure here is period-scoped. See gotcha #91 — outstanding debt is all-time by design, and the two are labelled apart on purpose.

### How the data is built

Two arrays feed almost everything, and both come from code that already existed.

**Money out needs no new query at all**: `ExpenseService.getExpensesView` already returns `ExpenseItem[]` carrying date, amount, currency, frozen rate, branch, staff, category and product — with the derived stock half merged and the branch semantics of gotcha #88 applied.

**Money in** is three new reads, one per stream, all returning the same `CollectedRow` shape:

| Repository | Method |
| --- | --- |
| `ICollectionRepository` | `collectedInRange(startIso, endExclusiveIso, branchFilter)` — ONE read, one row per bill settled |
| `ISaleRepository` | `collectedInRange(…)` |

Each lives on the repository that owns its table (never a cross-table `ReportsRepository`, which would have to re-derive the branch scoping `BRANCH_SCOPES` already encodes), and each has a Supabase impl and an offline SQLite twin. `ReportsService` tags them with their `stream` and merges them into one `CashRow[]`.

Everything else — by stream, by category, by currency, the comparison, and every drill-down — is **pure client-side aggregation** in `reports/utils/aggregate.ts` (`sumByKey`, `topN`, `shareOfTotal`, `delta`). **One query per stream per window**, so a 12-month report costs the same round trips as a 1-month one.

Revenue is **cash collected**, exactly as on the dashboard, and from the same one read: `collection_items` by `collections.received_at`, each summed in USD via the collection's frozen `rate_per_usd_snapshot`. Reports and dashboard must reconcile to the cent for a single month — that is the acceptance test, and it is now hard to fail, because both call `CollectionService.collectedInRange`.

### Drill-down

Tapping a breakdown row or the debts card opens `RecordsSheet` with the records behind that number. It is always a **filter over rows already in memory** — never a second query — which is also what guarantees the rows add up to exactly the figure that was tapped.

### Export

The header's download button writes the section as CSV and hands it to the system share sheet (`expo-file-system` + `expo-sharing`); on web, where `expo-sharing` is a no-op, it falls back to a plain browser download. `src/shared/lib/csv.ts` does the RFC-4180 quoting and writes a UTF-8 BOM, so a customer name with a comma does not split a cell and Arabic opens correctly in Excel. The money sheet writes spending as **negative** rows, so its Amount column sums to the report's Net.

### Reusable pieces

A phase-2 report is a config object plus a data hook, because the presentation is already built: `ReportSection` (loading / error / empty / pull-to-refresh), `KpiRow`, `ReportCard`, `BreakdownList`, `RankedList`, `ComparisonPill`, `CurrencySplit` and `RecordsSheet`, with one palette in `reports/utils/reportColors.ts` so a stream keeps its colour on every card.

**There are no charts.** A charting library (`react-native-svg` + `react-native-gifted-charts`) was fitted and then taken back out — the numbers, the share bars and the drill-downs carry the reports on their own, and the library cost a native rebuild for decoration. Do not reintroduce one without a figure that genuinely cannot be read as a list.

Three things moved out of single-use homes on the way, and the reports then reuse them rather than re-writing: `StatTile` → `src/shared/components/`, the date-range helpers → `src/core/utils/dateRange.ts`, and the wallet's per-currency fold → `groupByCurrency` in `src/core/utils/currency.ts`.

### Release

This is **not** an OTA release. `expo-file-system` and `expo-sharing` (the CSV export) change the native fingerprint, so the installed build can never receive it — `npm run build-prod` plus a reinstall is required. The range reports scan `collections (tenant_id, received_at)`, which the ledger schema indexes. No table or column changes — the whole feature is read-only.

---

## Expenses

The app counted only money **in** — every hand-over summed into `monthlyRevenue`. Expenses are the other half, so the dashboard can answer "did I actually make money?". **Admin-only end to end** (RLS on the table, and the UI drops the segment, the quick action and the dashboard tiles for anyone else): rent and salaries are not staff business.

**Two sources, one view.** `ExpenseService.getExpensesView({ startIso, endExclusiveIso, branchFilter })` composes them into a uniform `ExpenseItem[]` + a USD `ExpenseSummary` — the same shape `LedgerService` uses (stored rows + a derived stream from another service):

| Source | Where it comes from |
| --- | --- |
| `manual` | Hand-typed rows in the `expenses` table (rent, salaries, fuel, …) |
| `stock` | **Derived** at read time from `stock_movements` — costed, non-voided, non-`'sale'` rows; `amount = quantity_delta × unit_cost`, so a costed **negative** row is a negative amount (money back) — older data only, since a manual entry can no longer remove stock |

**A restock never writes an expense row.** Deriving it means correcting the stock corrects the expense, with no second insert inside the offline restock transaction, no drift on a void, and no orphan when a hard-deleted product takes its ledger with it. The cost of that choice is that a derived row **cannot be voided** (`ExpenseItem.canVoid` is false; its 3-dot offers "Open product") — a wrong cost is fixed on the entry that carries it — **Edit entry** for a mistyped one, **Revert entry** for one that should never have existed — and both take the money off the month that entry belongs to (see [Stock](#stock) → cost, and gotchas #94 / #96). Row ids are prefixed (`exp:` / `stock:`) so the two sources can never collide.

**Credits print `+`, in green.** A negative amount is the one figure on this screen that is not money leaving, so `outflowLabel()` — used by the card, the total-spent headline and every month section total — flips the leading `−` to `+` over the absolute value. Without it a credit reads `−-$5.00`. Its label says what it is (`Water ×2 returned`) instead of `×-2`.

**Cash basis, exactly like revenue.** A purchase counts in the month it was **paid for**, never the month the goods sell — no FIFO, no cost layering, and unsold stock is inventory rather than a loss. Manual rows key off `incurred_at`, a **user-picked date** (last month's rent entered today belongs to last month), not `created_at`.

**`expenses` table** — `branch_id` (its **own**, `NULL` = a company-wide expense), `category` (free text at the DB level; the app owns the code list, so a new category needs no migration), `description`, `amount` + `currency_id` + `rate_per_usd_snapshot` (the standard frozen-rate trio), `recorded_by_user_id`, `incurred_at`, soft-void fields. **Void-only, no edit** — a typo is voided and re-entered, so the row is its own history and the table is deliberately **not audited** (the same call as the debt tables). No tier gating.

**Branch semantics: one rule, and it is `owned` on both halves.** `expenses.branch_id` is `owned`, and NULL means **the company bought it, no branch did** — so a company-wide expense shows in the **All branches** view only (the "Unassigned" chip reaches it on its own). The *derived* half follows the same rule via the parent **product**: `stock_movements: { kind: 'inherited', joinedTable: 'products' }`, deliberately narrower than the stock RLS policy. Both exist for the same reason — **branch views must sum to the tenant total**. Making either one `shared` puts head-office rent, or a shared product's delivery, into every branch's expenses at once, and two branch admins each read the same money as theirs. The RLS policy is wider than the app filter on purpose: visibility and aggregation are different questions. Gotcha #88.

**UI.** An **Expenses** segment in the Transactions hub (admin-only) plus an "Add expense" quick action. `ExpensesPanel` reads a **date window** (the current calendar month by default) rather than paginating, so section totals are always the local sum: a total-spent headline with a stock/other split, search + category + From/To chips, then a month-grouped `SectionList` via the shared `groupByMonth` / `MonthSectionHeader`. Every amount carries a leading `−`. `ExpenseFormSheet` is the `CustomDebtFormSheet` shape (category `Dropdown`, `CurrencyInput`, `DatePickerInput` capped at today, branch picker, description).

**Dashboard.** `DashboardMetrics` gains `monthlyExpenses` / `stockExpenses` / `customExpenses` / `netIncome`. **`monthlyRevenue` stays GROSS** — `netIncome` is the subtraction, so `prevMonthRevenue` and the vs-last-month pill keep their meaning. The hero card gains an orange `Expenses $X` chip (unsigned, like `outflowLabel()` on the Expenses tab) beside the red "Owed by customers −$X" one (orange vs red because they mean different things — money already spent vs money not yet collected) and a `Net this month` line, red when negative; two full-width tiles follow. Admin-only throughout: `getMetrics` reuses the wallet's `viewer` gate.

**Code map:** `src/modules/transaction/expenses/` (repository + service + `expenseCategories.ts` + panel/card/form), the `expenses` slice + `useExpenseSlice`, `stockCostsInRange` on `IProductRepository`. See gotchas #88, #89 and #94; QA [expenses.md](../QA/expenses.md).

---

## WhatsApp Invoices

Staff can send the customer a **plain-text receipt over WhatsApp** — at the moment the money is taken, or later from the saved record. It is a `wa.me` deep link end to end: no PDF, no printing, no new dependency, no DB change, no server work. Everything lives in the small `src/modules/invoicing/` module.

**The module (4 files).**

- `utils/invoiceText.ts` — **pure** builders, no React and no i18n singleton: `t` arrives inside an `InvoiceContext { t, orgName, locale, currencies, displayCurrencyId }` (the same "pass `t` in" pattern as `blockRangeLabel.ts`). Exports `buildPaymentInvoiceText(ctx, customerName, rows)`, `buildSaleInvoiceText(ctx, sale, customerName)` and `buildSalesInvoiceText(ctx, sales, customerName)` (which falls back to the single-sale layout for one row, so a lone sale always produces the same document). It is **not a Service** — it decides nothing, validates nothing, throws nothing. It lives in a module rather than `src/core/` only because it reuses `getBlockRangeLabel`, and Core may not import from a module.
- `utils/invoiceRecipient.ts` — pure: collapses the rows of a multi-row receipt to the ONE customer it can be sent to, or names why it can't (`mixed` / `no_customer` / `no_phone`). Callers map their own row type down to `InvoiceRecipientRow { customerId, customerName, phone }`.
- `hooks/useSendInvoice.ts` — the one place that turns a saved record into a message. Gathers the context from the stores (`useAuthSlice` tenant name, `useCurrencySlice`, `useDisplayCurrencyId`, `useLanguageStore`, `useTranslation`), calls `openWhatsApp`, and on a `false` result shows the `confirm({ hideCancel: true })` dialog. Returns `{ canSend, resolveRecipient, sendPaymentInvoice, sendSaleInvoice, sendSalesInvoice }`; `resolveRecipient` is the recipient util plus the dialog that explains a refusal.
- `components/SendOnWhatsAppButton.tsx` — the app's single green (`bg-[#25D366]` + `logo-whatsapp`) action row. Matches `Button`'s geometry but is its own component because `Button` takes no icon and no `className`. `ContactToUpgradeButton` was re-pointed at it, so that markup now exists once.

**Entry points.**

| Where | Action |
| --- | --- |
| `CollectSheet` | (via each surface's own send flag) the hand-over it writes is sent as one receipt |
| `SaleFormSheet` | a second, stacked button — **Save & send on WhatsApp**, using the `Sale` `createSale` already returns |
| Quick pay — month-cell menu (`CustomerPaymentPanel`) + customer-card menu (`CustomerListScreen`) | a **Pay & send on WhatsApp** row beside "Quick pay" |
| **Month-grid multi-select** (`InlineSelectionToolbar`) | a green WhatsApp action beside "Collect" — one receipt for the hand-over it writes |
| `BillSheet` / the money-in history row menu | **Send on WhatsApp**, to re-send a saved hand-over any time |
| `SaleDetailSheet` + the three sales lists | **Send invoice on WhatsApp** — one sale, or one receipt covering a selection |

Stacked, not side-by-side: `Button` takes no `className`, and the long label (and its Arabic form) truncates at half a phone width.

**Both busy states are one marker, not two flags.** Each form tracks `busyOn: "save" | "send" | null`, set **before** the write and cleared in a `finally`, so the spinner stays on the button the user actually pressed across both phases (the store write, then the awaited deep link). Consequently `canSubmit` / `submitDisabled` are **validity-only** — folding the slice's loading flag into them greys out *both* buttons, and a disabled `SendOnWhatsAppButton` shows no spinner at all.

**No phone → visible but disabled, with a caption.** `canSend` digit-strips exactly like `openWhatsApp`, so `"-"` or `"n/a"` disables rather than producing a broken link. The button caption is `invoice.no_phone`, or `invoice.no_customer` for a walk-in sale; the menu rows use `ActionMenuItem.caption` for the same hint. **A voided hand-over or sale never shows the button** — a cancelled receipt is not a receipt.

**A receipt is ONE hand-over, and that simplified the whole builder.** `buildCollectionInvoiceText` replaced the old multi-row payment builder, and three rules it needed simply stopped existing:

- **One currency**, because a collection is single-currency — so no "one Total per distinct currency" any more, just one amount.
- **One date**, because a hand-over happens once — so no "date each bullet when the rows weren't collected together".
- **One customer**, because a collection belongs to one — so no `resolveRecipient` refusing a mixed selection.

What is left is the split: a hand-over that settled one bill names it above the amount, and one that settled several lists them as bullets under **"This pays"**, oldest bill first. The old rules were all workarounds for receipts assembled out of unrelated rows; the model now produces the receipt directly.

**Message format** (owned entirely by `invoiceText.ts`): `*Org name*` bold header + a receipt title, then `Label: value` lines, list rows prefixed with a literal `•`, and an `invoice.thank_you` footer. Amounts are `formatMoney(v, source, source)` where `source = snapshotCurrency(row, currencies)` — the literal cash at the row's frozen rate — with a ` (≈ …)` display-currency suffix on the **one** headline amount only. The date uses `getDateLocale(language)`, which always returns `en-US`: `formatMoney` hardcodes Latin digits, so an `"ar"` date would mix numeral systems inside one message.

**A multi-plan or multi-month collection is naturally one message**, because it is naturally one row. `CustomerListScreen`'s "collect all due" groups a customer's lines **by currency** and writes one collection per group (a collection cannot mix currencies), so a customer billed in two currencies receives two receipts — which is correct: he handed over two piles of cash.

**Several sales still need the multi-row builder**, and `buildSalesInvoiceText` is unchanged: a sales-list selection is genuinely a set of unrelated records, so it keeps the oldest-first sort, the per-currency totals and `resolveRecipient`'s refusal of a mixed selection.

**Getting the created record back.** `ledger.collect` returns the created `Collection` (no new state field), which is all a receipt needs — the header, its split, and its id.

See gotchas #68, #69, #80. QA: [../QA/whatsapp-invoices.md](../QA/whatsapp-invoices.md).

---

## Transactions Hub

The bottom **Transactions** tab (`app/(app)/(tabs)/transactions`) is a hub hosting in-page segments via the shared `SegmentedTabs` control: **Debts** (default), **Sales**, and — for admins — **Expenses**. `TransactionsScreen` owns the page chrome (SafeAreaView + title + `BranchSelector` + segments); each segment is a self-contained **panel** that owns its own body (filters, list, sheets, multi-select) but not the chrome. The selection toolbar that used to live inside `PageHeader` was extracted into a shared `SelectionBar` so panels (which have no `PageHeader`) can render it; `PageHeader` re-uses `SelectionBar` and re-exports `SelectionAction` for back-compat. While a panel is in selection mode it **replaces its filter row** with the single `SelectionBar` (see the shared selection row below).

- **Debts** → `DebtsPanel` (see [The Ledger](#the-ledger-charges--collections) — `ledger` slice).
- **Sales** → `SalesPanel` (the former `SalesListScreen` body, behavior unchanged — `sales` slice).
- **Expenses** → `ExpensesPanel` (see [Expenses](#expenses) — `expenses` slice). **Admin-only**: the segment is dropped from the array entirely for a non-admin, matching the RLS on the table.

> **There is no Services segment.** It existed as a "coming soon" placeholder and was **removed** when services shipped, because a service turned out to be a **line on a sale** rather than its own record — so the Sales tab already lists every one of them, and the price list belongs at Admin → Services. See [Products & One-Off Sales → Services](#services).

> **The money-in history is a sheet, not a tab.** `CollectionsPanel` lives in a
> full-height bottom sheet (`CollectionsHistorySheet`) launched from the
> **PageHeader 3-dot quick-actions menu** ("Money received", first item) on any
> screen, riding the same `ui`-slice / `QuickActionSheets` seam as the other
> quick-add sheets. It is **one** list where there used to be two: a month, a
> sale and a custom fee are all settled by the same `collections` row, so the
> payments history and the debt-payments history had nothing left to keep apart.
>
> **Voided hand-overs STAY in the list, marked** — history is a record of what
> happened, so the read passes `includeVoided: true` and `voidCollections`
> **merges** the voided rows back into `items` instead of dropping them. Money
> never counts one: `monthlyTotals` excludes voided rows server-side, and the
> panel's own per-row sum returns 0 for them. The **month grid is untouched** —
> it keys off collected money, and a voided collection contributes none.

**Month-grouped lists.** Sales, Payments, and Debts all render as a `SectionList` grouped by calendar month, newest first — one section header per month ("This Month" for the current month, else "June 2026"). The two newest buckets break out ahead of the months: **Today** (`common.today`) and **This Week** (`common.this_week`, Monday-based week start, excluding today) — a row lands in exactly one bucket (today → this week → its month). The grouping is a pure view transform (`groupByMonth` in [monthSections.ts](../SubsTrack/src/shared/lib/monthSections.ts)) over the **already date-desc-sorted** slice data, so the slice/service stays the single source of sort order — it only buckets, it never re-sorts. Day/week bucket totals are always summed locally (their newest rows are guaranteed loaded); a month whose newest rows were peeled into Today/This-Week has that peeled USD subtracted from its authoritative `totalsByMonth` total so the header still reads the correct remainder. Each panel supplies the row's date: Sales → `soldAt`, money received → `receivedAt`. (Debts is a flat debtors list — it has no month sections.) Headers render via the shared `MonthSectionHeader`; sticky headers are disabled. Selection / select-all still resolve against the flat slice array (the sections are built from it), so multi-select is unaffected. Full month names come from the `months_long` i18n block; "This Month" from `common.current_month`.
  - **Month totals.** Each panel also passes `groupByMonth` a `getAmountUsd` row-to-USD function, so every section carries a `totalUsd`; `MonthSectionHeader` renders it (formatted into the display currency) at the trailing edge of the header, next to the row count. Sales sum the **value sold** (`totalAmount`, matching `soldAt`); the money-in history sums the **cash received** (`amount / ratePerUsdSnapshot`, matching `receivedAt`). (Debts no longer uses month sections — it's a flat debtors list; the debtor detail modal groups a customer's debts/payments via the shared `DebtList`.)
    - **Sales/Payments are paginated (`PAGE_SIZE` = 30) — summing only the loaded rows would under-count any month with more rows than one page.** Both panels instead pass `groupByMonth` a 5th arg, `totalsByMonth: Record<"YYYY-MM", number>`, which — for any month key present — overrides the local per-row sum. That map comes from `saleSlice`/`collections`'s `monthlyTotals` state, refetched (in parallel with the paginated page) every time filters change via `SaleService.getMonthlyTotals` / `CollectionService.getMonthlyTotals`, and **patched in place after a write** by `addMonthTotal(totals, iso, deltaUsd)` — recording, correcting or voiding a row moves its month by that row's value instead of re-running the aggregate (a month the map does not hold is left alone: it was never fetched, so `groupByMonth` is already summing it locally), which bucket `SaleRepository.monthlyTotals` / `CollectionRepository.monthlyTotals` — the **same filters as `findAll`, but unpaginated and projected to just the 2–3 numeric columns needed to sum** (no joins beyond what a search/branch filter needs), so it stays cheap even over a whole table. `fetchMoreSales`/`fetchMoreCollections` (loading further pages of an unchanged filter set) do **not** refetch it — the total doesn't change, only which rows are visible. Debts isn't paginated (it loads its full filtered set up front), so it never passes this arg and keeps summing locally.

**Money received (tenant-wide):** `CollectionsPanel` lists every hand-over of
cash across all customers, newest first, defaulting to **this month**. Backed by
the `collections` slice + `CollectionRepository.find` +
`CollectionService.getHistory` (returns `CollectionListItem` — the header, its
split, the joined customer name and phone, and the one `kind` every line shares
or `'mixed'`). Branch scoping is the collection's **own** `branch_id` (gotcha
#103). Multi-select enables bulk void. The per-customer `payments` slice and the
month grid are untouched.

**The card answers four questions, in reading order** — who paid, how much, what
it paid, who holds the cash: the **customer's name** leads (bold, left) with the
amount bold on the right, the second line **names the bills** (`collectionLabel`
— the first two labels, then `+N more`; a bare "3 items" count named nothing),
and the third is the **collector** plus the moment the cash arrived, printed to
the **minute** (`formatDateTime`). The kind is told **twice**: by the **icon's
colour** and by a **kind chip** in words (Month / Sale / Custom / Mixed), both
read off one `KIND_STYLE` row (month and sale emerald — a sale is emerald
app-wide, so the receipt glyph parts them — manual violet, mixed indigo). The
chip was briefly dropped, because one emerald badge on every kind made the list
a green wall, and it came back the moment sale and month started sharing a
colour: a glyph alone is too quiet to classify a row, so the fix is to **tint
the chip per kind**, never to delete it. The other chips are exceptions only:
`N items`, the **holder**
(amber, and only when custody has actually moved — a collector still holding
their own cash gets none), and a red `Voided` carrying its reason under a
struck-through amount. **Amounts print in the currency physically handed over**
(`formatMoneyPair`, gotcha #128), with the display-currency value as a small `≈`
line under it and only when it differs.

**Chrome:** a `PeriodPicker` (the same one Reports uses — the window is now a
visible chip instead of a silent one-month default), then chips for **Customer**,
**Collected by**, **Type**, **Status** (not voided / voided only), **Sort by**
(Received date / Recorded date / Last updated) and **Order** (newest / oldest
first), then one **summary bar** — "Collected in this view" — which sums the
slice's unpaginated `monthlyTotals`, so it covers every matching row rather than
the loaded page. **Type filters on the frozen `collections.kind`** (gotcha #128);
status maps onto `includeVoided` / `voidedOnly` and the sort onto `sortField` +
`sortDirection`, all four server-side in both repositories, so paging stays
correct. **Sort by offers only dates the hand-over itself owns** — a due date
belongs to the bills it paid, of which there can be several, and an amount sort
across currencies would have to be an expression; both are left out on purpose
(gotcha #129). Received and recorded genuinely differ, because a received date
is user-picked and can be back-dated.

**Tapping a row opens what it settled** — the bill itself for a single-bill
hand-over, `CollectionSplitSheet` when it settled several, and **always the
split for a voided row**, whatever it settled: the bill behind a reversal is
owed again, so it is no longer that row's story. A voided row used to open
nothing at all, which left the one question staff actually ask — who cancelled
this, when, and why — with no surface to answer it. So the sheet keeps the
**kind** pill and adds a red **Voided** one beside it (a void does not change
what the cash paid for), names the void's time, **its author** (`voidedBy`,
carried on `CollectionListItem` and patched into the store by `applyVoided`, so
it is right the instant you void) and its reason, heads the bills **"This had
paid"** with the caption *these bills are owed again*, and drops the custody row
entirely — a voided hand-over holds no cash, so "now with Sami" would be a lie. That sheet is the
hand-over's whole record: the total (+ `≈`), a status pill, then an `InfoRows`
block (customer · received to the minute · who took it · where the cash is now,
or "Banked" · **notes**, which were stored but shown nowhere before · the void
time and reason), then one `CollectionItemCard` per bill carrying the **bill's**
total, due date and billing instant. A bill card deliberately does **not** print
a remaining balance: that is the sum of every hand-over against the bill, so it
belongs to `BillSheet`, one tap away. `BillSheet` gained the same depth (customer,
month billed, bill total, due date, billed-at to the minute, who billed it,
notes) and now speaks the **bill's own currency** throughout — hero, remaining
and every payment row — with one `≈` display line under the hero.

---

## The Ledger (charges + collections)

Everything about money — what is owed, and what was handed over — lives in three
tables. This replaced the whole `payments` / `custom_debts` / `debt_payments`
family, and the reason is one sentence:

> `payments.amount_paid` and `sales.amount_paid` each hold **one number and one
> date**, so when a customer pays 12 now and 8 next month there is nowhere for
> the 8 to go.

Raise `amount_paid` and the 8 counts as revenue on the original date; leave it
and the row says he still owes it forever. Every debt problem the app had grew
from that: `debt_payments` was a workaround that could only point at a
*customer*, never at which month or sale it paid; debt was a customer-level
`Σ categories − Σ payments`, so no individual line's balance was trustworthy;
"Complete" existed only because `amount_paid` had no date of its own.

### The model

| Table | Role | One row = |
| --- | --- | --- |
| `charges` | what is owed — **the bill** | a month, a sale, or a hand-typed fee |
| `collections` | money physically handed over | one hand-over: "$55, 5 Mar, taken by Sami" |
| `collection_items` | which bill that money paid | one bill touched by that hand-over |

A bill can take many payments and a payment can cover many bills — a genuine
many-to-many, which is exactly why the middle table exists. Partial payments,
installments, pay-later sales and oldest-first collection then all fall out for
free, and the wallet, the dashboard and Reports each collapse to a single source.

```
balance(charge)  = charge.amount − Σ collection_items (of non-voided collections)
debt(customer)   = Σ balance where balance > 0 AND (kind <> 'month' OR paid > 0)
owed(customer)   = debt items + unpaid months from buildMonthGrid, deduped on
                   (customer_plan_id, billing_month) — the charge row WINS
revenue(period)  = Σ collection_items in the period, by collections.received_at
wallet(user)     = Σ collections where held_by_user_id = user, per currency
```

**Nothing asks "does a charge row exist?" — everything asks "how much money came
in?"** A month bill left at 0 collected (after a void) reads *identically* to no
row at all. Miss this and a voided payment leaves a ghost debt behind.

### Balance is never a column

`charge_balances` is a `security_invoker` view (the `product_stock` precedent);
offline the same `GROUP BY` runs over the mirror, so one mapper serves both. Two
devices can therefore both collect offline without clobbering a counter.

> **The view's `CASE` is load-bearing.** `p.voided_at IS NULL` sits in a LEFT
> JOIN's `ON` clause, which does not *drop* an item whose collection was voided —
> it only leaves the joined row all-NULL. A bare `SUM(i.amount)` keeps counting
> voided cash, and voiding a payment never gives the balance back.

### The waterfall

`ledger/utils/waterfall.ts` is pure — no I/O, no clock. `allocate(amount, items)`
spreads money **oldest due date first, filling each bill completely** before
moving on. Never proportional: a customer settles his oldest bill, he does not
part-pay all of them.

The sort has **four levels**, and each earns its place:

1. `dueDate` — when it HAD to be paid. Never the date it was typed, or a fee
   back-dated to 2020 would jump the whole queue (gotcha #74 in a new place).
2. `issuedAt` — a January month billed today loses to one billed last week.
3. `createdAt`
4. `keyOf(item)` — a total order, so the preview and the save can never disagree
   and two devices splitting the same money land identically.

Leftover money means **overpay**, and the service refuses it: there is nowhere
for unapplied cash to live.

### Virtual months

A month has **no charge row until money reaches it**. `LedgerService.getOwed`
therefore merges two sources — stored bills, and unpaid months derived from
`buildMonthGrid` — deduped on `(customer_plan_id, billing_month)` with a
**PAID stored bill winning**. Miss the dedupe and an empty month charge left by a
voided collection is counted twice.

An **EMPTY** stored bill (nothing collected) deliberately LOSES the dedupe: it
must read like a month never touched, price included, so the virtual month wins
and carries the line's CURRENT price. The grid takes the same branch in
`monthItemFromEntry` (`entry.collected > 0`, not `entry.charge`), and both
`CollectionRepository.create` paths re-price the stored row to match before
collecting — otherwise the sheet would show the new price and bill the old one.
A bill money has reached always keeps its frozen amount. See gotcha #106b.

Collecting is what turns a month into a bill: `CollectionService.collect`
materializes it in the same write, with an id from
`deterministicId(customer_plan_id, billing_month)` — so two devices collecting
the same month offline converge on ONE row instead of billing the customer
twice.

### A line with no set price

A custom-price plan — or a customer with no plan at all — has no figure to bill,
so `resolveLinePrice` returns `kind: 'typed'` and **`getOwed` skips the line
entirely**: nothing can be poured over a bill whose amount nobody has typed. The
month cell still collects. It builds an **open item** (`OpenItem.openAmount`,
amount / balance / currency all empty) and the collect sheet grows one extra
field, **Amount for this month** — that field IS the bill, and it also decides
the currency, since an open item has none of its own.

Three rules:

- **Single item only.** Two open months in one write are two different unknown
  amounts, so a grid multi-select containing one is refused with a message.
  Quick pay follows the same rule: one price-less line opens the sheet on the
  customer list itself, two send you to the month grid.
- **Once the amount is typed the item becomes an ordinary bill**
  (`billedOpenItem` in `CollectSheet`), so a part payment, the "leaves N owing"
  hint and the overpay refusal are the existing code, not a second
  implementation. "Owed 50, paid 20" works exactly as it does for a priced line.
- **The bill is raised at what was typed**, in the hand-over's currency:
  `CollectionService.materialize` uses `item.amount > 0 ? item.amount : line.amount`.

Once that first bill exists the line behaves like any other — the remainder is a
debt, and the Debts screen and the waterfall both see it. See gotcha #112.

### Owed vs debt

| | includes | consumed by |
| --- | --- | --- |
| **OWED** | everything with a balance, plain unpaid months included | the waterfall, and only the waterfall |
| **DEBT** | partly-paid months, open/partly-paid sales, hand-typed fees | the Debts screen |

`isDebtItem(kind, paid) = kind !== 'month' || paid > 0` — one function, in
`ledger/utils/openItems.ts`. **A fully unpaid month is NOT a debt**: it is
`unpaid`/`overdue` in the month grid, which is its own screen and its own
workflow. It becomes a debt the moment it is *partly* paid, which is exactly
when it stops being routine.

**The Debts screen never lists a plain unpaid month at all**, and that is
structural, not a filter: `getDebtsView` reads **stored bills only** (no virtual
pass — do not add one), and a month has no bill until money reaches it. So the
`unpaidMonths` section fills only from **partly-paid** months. The one leak was
an **empty** bill — a month paid and then voided keeps its `charges` row with
`paid = 0` — which made voiding a payment the single way an unpaid month could
appear there, showing that lone month while the customer's genuinely unpaid
months stayed hidden. `buildDebtsView` now drops `kind === 'month' && paid <= 0`,
so an emptied bill reads exactly like a month never touched (gotchas #106,
#106c).

### Void vs write-off

Two different statements about one bill, and `chk_charges_void_xor_write_off`
keeps them mutually exclusive:

| | means | effect |
| --- | --- | --- |
| **void** (`voided_at`) | it was a MISTAKE — it never existed | gone from every figure. `voidCharge` is refused once money sits on it; `voidChargeWithPayments` is the deliberate "take the cash with it" door (see below) |
| **write off** (`written_off_at`) | it is REAL but will never be paid | leaves "still owed", reported as a **loss** in Reports → Debts |

Voiding a **collection** is the third, and different again: the cash was real
but should not have been recorded. Every bill it touched gets its balance back
on its own, because a balance is a sum over live items and this row stops being
one.

**A dead bill still owns its month, so collecting it REVIVES it.** `charges`
is unique on `(customer_plan_id, billing_month)` whatever the row's state, so a
voided or written-off month bill is the only row that month can ever have —
while every read (the grid, the debts screen, `charge_balances`) filters it out.
Cash aimed at that month would therefore be saved onto a row nothing can see:
counted in the wallet and in revenue, but the cell red again on the next
refresh, for ever. So the write fixes its target first. `reviveTargetBill(s)`
does two INDEPENDENT things: it clears all six void / write-off columns
**unconditionally** whenever money is about to land (cash contradicts both "it
was a mistake" and "it will never be paid"), and separately re-prices an EMPTY
month bill. Keeping them independent is the whole lesson — the un-void used to
be bundled into the re-price and so ran only when the price happened to have
moved. Two supporting rules: the paid check that guards the re-price sums
`collection_items` directly (a balance read hides the very row being fixed and
would answer 0), and `charge_balances` now excludes **only** voided bills,
because a write-off gives up on the remainder and does not un-collect what was
already handed over. "No longer owed" is decided in one place,
`ChargeRepository.find`. Gotcha #115.

### One currency per hand-over

A collection carries one currency, and it must equal the currency of every
charge it pays — which is why `collection_items` has **no currency or rate of
its own**. That is what lets a balance close at exactly zero, with no rate drift.
A customer owing in two currencies is collected from twice, and the collect
sheet shows a currency picker to say so. USD for revenue and the wallet uses the
**collection's** frozen rate (what physically arrived); USD for a debt total uses
the **charge's** (what he was billed).

### Screens

| Where | What |
| --- | --- |
| `CollectSheet` | the ONE collect form. Two modes: a whole customer (type an amount, watch the waterfall split it, untick a row to steer the cash on) or a single bill. Same write either way, so one code path and one audit shape. |
| `BillSheet` | one bill: a running `15 / 20 # Feature Deep-Dives

> Detailed behavior for each feature area. Read the relevant section BEFORE editing that area's code. Referenced from `CLAUDE.md`.
> The Month Grid algorithm itself stays in `CLAUDE.md` (it is the single most critical rule). This file covers everything built around it.

## Contents

- [Multi-Tenancy](#multi-tenancy)
- [Branches (multi-location)](#branches-multi-location)
- [Authentication Flow](#authentication-flow)
- [Multi-Month Plans](#multi-month-plans)
- [Multi-Currency](#multi-currency)
- [App Options (Global Config)](#app-options-global-config)
- [Tenant Settings (Per-Tenant Config)](#tenant-settings-per-tenant-config)
- [Subscription Tiers](#subscription-tiers)
- [Products & One-Off Sales](#products--one-off-sales)
  - [Services](#services)
- [Reports](#reports)
- [Expenses](#expenses)
- [WhatsApp Invoices](#whatsapp-invoices)
- [Transactions Hub](#transactions-hub)
- [The Ledger (charges + collections)](#the-ledger-charges--collections)
- [Regular Customer](#regular-customer)
- [Skipped Months](#skipped-months)
- [Multiple Plans per Customer (service lines)](#multiple-plans-per-customer-service-lines)
- [Pay Oldest Month First](#pay-oldest-month-first)
- [Payment Scenarios](#payment-scenarios)
- [Multi-Select & Bulk Actions](#multi-select--bulk-actions)
- [Audit Trail](#audit-trail)
- [Developer Tools](#developer-tools)

---

## Multi-Tenancy

- **RLS is the primary guard** — all queries automatically scoped to the caller's tenant via Supabase JWT claims.
- **App-level filtering** (`tenant_id` from `authStore`) is a secondary belt-and-suspenders guard.
- `tenant_id` is injected into the JWT by a Supabase auth hook at login. **Never derive it from client input.**
- Login email convention: `username@tenantcode.com` (synthetic, not a real email address).

---

## Branches (multi-location)

Tenants can optionally create branches/zones. A tenant with zero branches behaves exactly as before — feature is invisible.

**NULL semantics differ per table:**

| Table       | `branch_id IS NULL` means                                      |
| ----------- | -------------------------------------------------------------- |
| `users`     | Tenant-wide admin (sees all branches and unassigned records).  |
| `customers` | UNASSIGNED — visible only to tenant-wide admins.               |
| `plans`     | SHARED catalog item — visible to every branch.                 |
| `payments`  | (no `branch_id` column — inherits from customer via FK + JOIN) |

**RLS layered on tenant_id:**

- `public.current_branch_id()` reads `users.branch_id` for the calling user (SECURITY DEFINER).
- Policies admit a row when `tenant_id` matches AND either the caller is tenant-wide (`current_branch_id() IS NULL`) or the row's branch matches. Plans additionally admit `branch_id IS NULL` (shared) for everyone.
- Payments inherit via `EXISTS (SELECT 1 FROM customers c WHERE c.id = payments.customer_id AND c.branch_id = current_branch_id())`.
- Branch switching for tenant-wide admins is purely UI state in `uiPrefStore.currentBranchId` — no JWT change.

**UI:**

- [BranchSelector](../SubsTrack/src/shared/components/BranchSelector.tsx) is a chip rendered below `PageHeader` on Customers/Dashboard/Plans/Users. It self-conceals: only renders for tenant-wide admins (`user.branchId === null`) when ≥1 active branch exists.
- Options: All Branches (`null`) / each active branch / Unassigned (`BRANCH_FILTER_UNASSIGNED`).
- `useEffectiveBranchFilter()` / `resolveBranchFilter(user)` in [branchFilter.ts](../SubsTrack/src/shared/lib/branchFilter.ts) returns the active filter: branch-scoped users always get their own `branchId`; tenant-wide admins get `uiPrefStore.currentBranchId`.
- `applyBranchFilter(query, filter, column?)` mutates a supabase query builder: `null` → no-op, `BRANCH_FILTER_UNASSIGNED` → `.is(column, null)`, UUID → `.eq(column, uuid)`.

**Form behavior:**

- CustomerFormSheet: Branch picker only shown to tenant-wide admins. Branch-scoped users auto-assign their own branch. The plan dropdown filters to `branch_id IS NULL OR branch_id = selected_branch`, and the inline Plans editor's `PlanPicker` is **disabled** (greyed, with a "Select a branch first" hint) while no branch is chosen (`branchId === null`) — branch is required, so a plan can't be picked before it. `Dropdown` grew a `disabled`/`disabledHint` prop for this, threaded through `PlanPicker`.
- PlanFormSheet: Branch picker only for tenant-wide admins; nullable (= Shared, visible to every branch) — mirrors ProductFormSheet. Branch-scoped users always create branch-scoped plans (their own).
- UserFormSheet: Branch picker for tenant-wide admin. Once ≥1 branch exists, role=`user` requires a branch (enforced in `UserService.validate`). The `create-user` edge function additionally validates and forces branch_id for branch-scoped callers.

See gotchas #26–#32 for the full branch NULL-semantics + enforcement rules.

---

## Authentication Flow

```
app/index.tsx
  → authSlice.restoreSession()   (on mount)
  → if no session → redirect to (auth)/login
  → if session → redirect to (app)/(tabs)/home (admin) or (app)/(tabs)/customers (user)

LoginScreen
  → authSlice.login(username, tenantCode, password)
  → AuthService: email = `${username}@${tenantCode}.com`
  → AuthRepository.signIn(email, password)   [Supabase Auth]
  → AuthRepository.getUserProfile(userId)    [public.users]
  → AuthRepository.getTenant(tenantId)       [tenants joined with tier_plans]
  → stores AuthUser + tenantActive in authSlice
  → primePostAuth(user) — Promise.all of:
       get().currencies.fetchCurrencies()
       get().branches.fetchBranches()
       get().options.fetchOptions()         (loads global app_options — e.g. LiraRate)
       get().subscription.init(tenantId)
         → tierService.fetchTiers() (3 tier_plans rows)
         → tierService.fetchUsage() (counts customers/users/plans/branches/currencies)
         → tierService.getTenantWithTier(tenantId) — fresh tenant + joined tier
           → also writes back via authSlice.setUserTier so user.tenant.tier stays in sync

LoginScreen also exposes "Create a new organization" → signupSlice (2-step form):
  Step 1 (SignupOrganizationScreen)
    → signupSlice.validateAndCheckCode()
    → SignupService.validateOrganization() + repo.isTenantCodeAvailable()
    → on success → push /(auth)/signup-account
  Step 2 (SignupAccountScreen)
    → signupSlice.submit()
    → SignupService.createTenant() → SignupRepository.createTenant()
    → supabase.functions.invoke('create-tenant') [service-role server-side]
       atomically: tier_plans (lookup Free id) → tenants(tier_id=Free) →
       branches('Default Branch') → auth.users → public.users(role=superadmin, branch_id=null)
       cascading rollback on any step
    → auto-login via authSlice.login(...) with the just-entered credentials
    → root layout reacts to authSlice.user and routes into the app

app/(app)/_layout.tsx
  → if !user → redirect to login
  → if !tenantActive → show TenantInactiveScreen
  → otherwise → render tabs
```

**Hydration note:** `authSlice` exports an internal `primePostAuth(get, user)` helper called by `login` and `restoreSession`. It runs `get().currencies.fetchCurrencies()`, `get().branches.fetchBranches()`, `get().options.fetchOptions()`, and `get().subscription.init(tenantId)` in parallel via `Promise.all`. `subscription.init` is the **source of truth** for the active tier (see Subscription Tiers below).

See `docs/edge-functions.md` for `create-tenant` internals and gotcha #33 for the anon-path rationale.

---

## Multi-Month Plans

Plans can cover 1–12 consecutive months. When `durationMonths > 1`:

- The plan represents a **bundled price** for the entire period (not per-month).
- Multi-month plans **must have a fixed price** — `isCustomPrice` must be `false`.
- A single `Payment` record is created with `durationMonths` matching the plan. That payment covers all months in the range.

**Recording a multi-month payment (one bill, `duration_months > 1`):**

1. Builds a coverage set from existing active payments to detect conflicts.
2. If any months in the proposed range are already paid:
   - With `skipConflicts = false` → throws an error listing the conflicting months.
   - With `skipConflicts = true` → finds the first uncovered month, adjusts `effectiveStart` and `effectiveDuration`, records a single payment for the remaining range.
3. Returns `{ payment, skippedMonths }` so the UI can surface conflict info.

**Return types:**

```typescript
type MultiMonthConflict = { billingMonth: string; label: string };
type CreateMultiMonthPaymentResult = {
  payment: Payment;
  skippedMonths: MultiMonthConflict[];
};
```

See gotchas #13, #14, #15 for the storage + grid-rendering details.

---

## Multi-Currency

The app supports an arbitrary list of non-USD currencies per tenant. USD is the implicit base — never stored in the `currencies` table.

**Storage model: amount is as-typed, paired with `currency_id`.**

- `plans.price` + `plans.currency_id` — the price was literally `89000` in LBP (not 1.00 USD). Plan USD equivalents use the **live** rate (forward-looking pricing).
- `charges.amount` (what he was BILLED) and `collections.amount` (what he HANDED OVER), each with its own `currency_id` + `rate_per_usd_snapshot`. The customer literally handed over `89000 LBP`. **The LBP value is preserved forever**, and the USD equivalent is frozen at each row's own recording time. The two rates are deliberately separate: a debt total converts at the rate he was billed at, revenue and the wallet at the rate the cash arrived at. `BillSheet`, the year totals and every dashboard aggregate convert via the snapshot — they do not drift when the live rate is edited.
- `null currency_id` means USD throughout the codebase; USD payments store snapshot = 1.

**Conversion helpers** ([src/core/utils/currency.ts](../SubsTrack/src/core/utils/currency.ts)):

```ts
toUsd(amount, source: Currency | null): number       // null source → amount unchanged
fromUsd(amountUsd, target: Currency | null): number  // null target → amount unchanged
convert(amount, source, target): number              // go via USD
formatMoney(amount, source, target): string  // convert + Intl.NumberFormat
findCurrency(currencies, id | null): Currency | null
paymentSnapshotCurrency(payment, currencies): Currency | null  // returns the source Currency with ratePerUsd overridden by the payment's snapshot — use everywhere a historical payment amount is displayed
```

**`CurrencyInput`** ([src/shared/components/CurrencyInput.tsx](../SubsTrack/src/shared/components/CurrencyInput.tsx)) — the reusable input with an embedded currency dropdown. Used in PlanFormSheet (price) and CollectSheet (the amount received). The dropdown lists USD + active tenant currencies. Switching currency does NOT convert the typed number — switching means "I meant this number in the new currency."

**Display currency is per-TENANT, not per device** — stored in `tenant_settings` under the `DisplayCurrencyId` key (a `currencies.id`; blank/unset = USD), set by an admin in Tenant Settings and read everywhere through the `useDisplayCurrencyId()` hook. Every user of the organization therefore sees amounts in the same currency, on every device, and an admin's change reaches the others on their next sync/login. All read-only displays (PlanCard, DashboardScreen, admin/index revenue card, CustomerPaymentPanel year summary) convert their values to it at render. The currency a value was **stored in** is preserved in `BillSheet`'s primary line for receipt fidelity, with the display-currency equivalent as a secondary "≈" line. A soft-deleted / unknown id resolves to `null` via `findCurrency`, so the UI falls back to USD instead of crashing.

**Aggregates** (Dashboard) sum across mixed currencies by converting each row to USD using its `rate_per_usd_snapshot` (drift-free historical totals) in `DashboardService.getMetrics()`. The screen then formats the USD total in the tenant's display currency.

**Last-used currency** persists in [src/shared/lib/uiPrefStore.ts](../SubsTrack/src/shared/lib/uiPrefStore.ts) so the `CurrencyInput` dropdown defaults to whatever the user typed in last time.

**Currency deletion** is safety-guarded: `CurrencyService.deleteCurrency()` counts references in `plans` + `payments`. If non-zero, it does a soft-delete (sets `active = false`); otherwise it hard-deletes. `ON DELETE RESTRICT` on the FKs prevents any chance of orphaning historical data.

**Default Lebanese Pound currency.** Every newly created tenant is auto-seeded with an `LBP` (Lebanese Pound) currency (`decimals = 0`, `symbol = 'ل.ل'`). Its `rate_per_usd` is copied **once, at creation time**, from the global `app_options.LiraRate` option (see App Options below). After creation it is an ordinary editable tenant currency — the seed is a starting default, not a live link. Both tenant-creation paths seed it: SuperAdmin's `TenantService.createTenant` (via `TenantRepository.getLiraRate` + `createLbpCurrency`) and the public `create-tenant` edge function. A missing/invalid `LiraRate` never blocks signup — both paths fall back to `DEFAULT_LIRA_RATE = 89000`.

See gotchas #18, #19, #21, #22, #24, #36 for the snapshot/conversion rules.

---

## App Options (Global Config)

`app_options` is a **global, app-wide** key/value table (NOT tenant-scoped — no `tenant_id`). Columns: `id`, `key` (unique), `value` (text), `description`, timestamps. It holds cross-tenant configuration the SaaS owner controls. Seeded keys today:

- `LiraRate` — default USD→LBP rate (LBP per 1 USD) used when seeding each new tenant's LBP currency.
- `AllowPlanUpgrade` (`'true'`/`'false'`, default true) — when `false`, the in-app upgrade buttons (`TierCard`, `UpgradePromptModal`) are replaced by a "contact to upgrade" WhatsApp button that deep-links to `SupportWhatsAppNumber` with a pre-filled message. Purely a UX gate.
- `AllowSelfServiceSignup` (`'true'`/`'false'`, default true) — when `false`, the login screen hides the "Create organization" button **and** the `create-tenant` edge function rejects signups (`403`, `code: signup_disabled`) — server-side is authoritative.
- `SupportWhatsAppNumber` — support WhatsApp number (international format, digits only) used by the upgrade WhatsApp deep-link.

- **RLS:** `app_options_select` grants `SELECT` to **`anon` + `authenticated`** (anon is required because some flags gate pre-auth UI, e.g. self-service signup on the login screen). There is **no** write policy, so only the **service role** (SuperAdmin app + the `create-tenant` edge function) can insert/update/delete — RLS bypass is the write path.
- **SuperAdmin** owns full CRUD via the **Options** tab ([app/(tabs)/options.tsx](<../SuperAdmin/app/(tabs)/options.tsx>) → `OptionsScreen`). The `options` module mirrors `tier-plans` (repository + service + standalone `optionStore` + screen + `OptionFormSheet`) but adds create + delete. The option **key is immutable after creation** (only `value` + `description` are editable), so well-known keys can't be renamed out from under the code that reads them.
- **SubsTrack** has a **read-only** `options` module (repository `findAll`/`findByKey` + `OptionService.getOptions`/`getOptionValue` + `optionSlice` + `useOptionSlice`). It never writes. Options are fetched **at app bootstrap** (`app/_layout.tsx`, so the pre-auth login screen can read flags) and re-primed on login/restore via `primePostAuth`; they are intentionally **not** reset on `logout`. Reference keys through `OPTION_KEYS`, never magic strings. Read values through the typed selector hooks in [useOptionSlice.ts](../SubsTrack/src/state/hooks/useOptionSlice.ts): generic `useOptionValue(key)` / `useBooleanOption(key, fallback)`, and semantic `useCanUpgradePlan()` / `useSelfServiceSignupEnabled()` / `useSupportWhatsAppNumber()`. For **conditional UI**, prefer the declarative gate components in [FeatureGate.tsx](../SubsTrack/src/shared/components/FeatureGate.tsx) — `<CanUpgrade fallback={…}>` and `<CanCreateOrganization>` — which wrap the gated element and render `children` when enabled, else `fallback`; this keeps flag ternaries out of the screens. WhatsApp deep-links go through `openWhatsApp()` in [shared/lib/whatsapp.ts](../SubsTrack/src/shared/lib/whatsapp.ts).

See gotcha #38.

---

## Tenant Settings (Per-Tenant Config)

`tenant_settings` is the **tenant-scoped twin** of `app_options`: same key/value shape, but every row carries a `tenant_id`, and it is written **in-app by admins** rather than by the SaaS owner. Columns: `id`, `tenant_id`, `key`, `value`, timestamps, with `UNIQUE(tenant_id, key)`.

- **RLS:** `tenant_settings_select` lets **every member** of the tenant read (the values drive shared behavior, so a non-admin collector must see them too); `tenant_settings_write` restricts `ALL` to `admin` / `superadmin` of that tenant. Both scope on `current_tenant_id()`.
- **Module:** `src/modules/admin/tenant-settings/` — the usual repository (platform switch) + service + mapper + `TENANT_SETTING_KEYS`. `TenantSettingService` owns the **parsing** of raw strings into typed settings (`parseUnpaidStartRule`), so no caller ever inspects a raw value.
- **State:** the `tenantSettings` slice (loaded in `primePostAuth`, **reset on logout** — unlike the global `options` slice, since it is tenant-scoped and must not leak to the next tenant on a shared device). Read through [useTenantSettingSlice.ts](../SubsTrack/src/state/hooks/useTenantSettingSlice.ts): generic `useTenantSettingValue(key)` and semantic `useUnpaidStartRule()`. Reference keys through `TENANT_SETTING_KEYS`, never magic strings.
- **UI:** Admin → Tenant Settings, one section per setting (`UnpaidRuleSection`), matching `DisplayCurrencySection`'s card layout. Saving refreshes the current-month badge sets, since a rule change restates which months are unpaid.
- **Offline:** a normal tenant-scoped synced table. The offline write derives a **deterministic id from `(tenant_id, key)`** and upserts on that natural key (registered in `NATURAL_KEYS` **and** in `sync/push.ts`'s `conflictTarget`), so two devices setting the same option offline converge on one row instead of stalling the push on the UNIQUE index.

**Keys today:**

- `UnpaidStartRule` (`'month_start'` default \| `'customer_start_day'`) — when a month turns unpaid, and when the customer starts reading "Overdue". Those are **two** facts under `'customer_start_day'`: the **current** month is grey until the line's billing day (`isNotDueYet`), and **last** month is red but not yet *late* until that same day (`isNotLateYet`) — see gotcha #83. See [CLAUDE.md](../CLAUDE.md) → Critical Business Logic: Month Grid for the full rule; both helpers live in `customer-payments/utils/monthDueRules.ts`, shared by the grid and the customer-list aggregator.

**Adding a new key:** add it to `TENANT_SETTING_KEYS`, give `TenantSettingService` a typed setter + parser, add a semantic hook, and render a section on the screen. No schema change is needed — it is a key/value table.

---

## Subscription Tiers

Every tenant lives on one of three global `tier_plans` rows: **Free**, **Pro**, **Business**. The catalog is small and fixed (3 rows seeded by `script.sql`, editable by the SaaS owner via SuperAdmin's tier-plans module). Each tier defines numeric limits (`max_customers`, `max_users`, `max_plans`, `max_branches`, `max_currencies` — NULL means unlimited), feature flags (`multi_currency_enabled`, `multi_month_plans_enabled`), and a USD monthly price.

**Enforcement is service-layer.** Every feature `Service.createX()` calls `tierService.assertCanCreate(tier, usage, resource)` immediately after its existing `validate()`. Failures throw a typed `TierLimitError` (from [TierService.ts](../SubsTrack/src/modules/subscription/services/TierService.ts)) carrying `{resource, limit, tierCode}`. Slice actions catch via `instanceof` and set a structured `tierLimitError` field next to the standard `error: string`. Form sheets check `tierLimitError` and render an `UpgradePromptModal` (the existing `ErrorBanner` path stays for regular validation errors). This avoids parsing error strings.

**Tier and usage are passed in as parameters from components**, not read across slices in actions (slice actions still touch `get().subscription.refreshUsage()` after creates, but the _input_ tier/usage comes from the caller). The pattern in slices:

```ts
createCustomer: async (data, tenantId, tier, usage) => {
  set((s) => {
    s.customers.loading = true;
    s.customers.error = null;
    s.customers.tierLimitError = null;
  });
  try {
    const customer = await customerService.createCustomer(
      data,
      tenantId,
      tier,
      usage,
    );
    set((s) => {
      s.customers.items.unshift(customer);
      s.customers.loading = false;
    });
    void get().subscription.refreshUsage(); // ← cross-slice via get()
  } catch (e) {
    if (e instanceof TierLimitError) {
      set((s) => {
        s.customers.tierLimitError = {
          resource: e.resource,
          limit: e.limit,
          tierCode: e.tierCode,
        };
        s.customers.loading = false;
      });
    } else {
      set((s) => {
        s.customers.error = (e as Error).message;
        s.customers.loading = false;
      });
    }
  }
};
```

Components read `currentTier` and `usage` from `useSubscriptionSlice` and forward them into the action.

**Hydration:** `authSlice` exports an internal `primePostAuth(get, user)` helper called by `login` and `restoreSession`. It runs `get().currencies.fetchCurrencies()`, `get().branches.fetchBranches()`, `get().options.fetchOptions()`, and `get().subscription.init(tenantId)` in parallel via `Promise.all`. `subscription.init` is the **source of truth** for the active tier: it concurrently fetches the tier catalog, the tenant's usage, and the tenant row with its joined tier (`tierService.getTenantWithTier`), then writes the resolved tier back to `auth.user.tenant.tier` via `authSlice.setUserTier` so the auth slice stays in sync. This is why a tier upgrade made in a previous session is reflected immediately on app restart — the subscription slice never trusts a parameter-passed tier; it always re-queries the DB.

**Upgrade UX:** dedicated screen at [SubscriptionScreen.tsx](../SubsTrack/src/modules/subscription/screens/SubscriptionScreen.tsx) (routed at `/(app)/(tabs)/admin/subscription`). Shows 3 stacked TierCards with usage bars for the current tier and Upgrade/Downgrade buttons for the others. Upgrades are instant swaps via `subscriptionSlice.upgrade(tenantId, tierId)` — no billing wired up yet. Downgrades call `TierService.canDowngradeTo(targetTier, usage)` first; if usage exceeds the target tier's limits the dialog lists blockers ("42 / 30 customers") and refuses to swap. The `UpgradePromptModal` is also triggered inline whenever a form sheet hits a `TierLimitError`. The "Subscription" entry in the admin menu ([admin/index.tsx](<../SubsTrack/app/(app)/(tabs)/admin/index.tsx>)) is rendered only for tenant-wide admins (`user.branchId === null`) — branch-scoped admins don't see it.

**`UpgradePromptModal` design:** for tenant-wide admins, the modal renders compact preview cards for the available upgrade tiers (every tier with `sortOrder > currentTier.sortOrder`), each showing name, monthly price, and a few key perks (customer/user caps, multi-month/multi-currency flags). The footer has "Not now" + "View plans"; "View plans" pushes `/(app)/(tabs)/admin/subscription`. Branch-scoped admins and staff see a stripped-down "Limit reached — contact your administrator" notice with just a Close button (they can't change the tier themselves).

**Soft UX gates** beyond the hard service-layer block: PlanFormSheet hides multi-month duration UI when `tier.multiMonthPlansEnabled === false`; CurrencyFormSheet hides itself behind the same `assertMultiCurrency` check; the Add buttons on list screens stay enabled so the user always reaches an explanation.

**Tenant creation defaults to Free.** Both the public `create-tenant` edge function and SuperAdmin's `TenantService.createTenant` look up the Free tier id and stamp it on the new `tenants` row. SuperAdmin's `TenantFormSheet` exposes a tier dropdown so the SaaS owner can onboard paid tenants directly or change a tenant's tier later (the manual paid-upgrade path). `tier_upgraded_at` is touched on every change.

**Future-proofing:** to add Stripe, append nullable `stripe_price_id_monthly` / `stripe_price_id_yearly` to `tier_plans` and `stripe_customer_id` / `stripe_subscription_id` to `tenants`. Only `subscriptionSlice.upgrade()` changes — it redirects to a Checkout session, the webhook updates `tier_id`. Every other call site already reads from `currentTier`.

---

## Products & One-Off Sales

`products` + `services` + `sales` extend SubsTrack beyond recurring subscriptions. `payments` (subscriptions) and `sales` are deliberately separate ledgers — they don't share schema or service code. Subscription month-grid logic is untouched.

**Products** mirror `plans` exactly: per-tenant catalog, optional currency, `branch_id IS NULL` = SHARED, soft-delete via `active = false` when a product has historical sales (hard-delete otherwise — mirrors `CurrencyService.deleteCurrency`). Tier-gated through `tier_plans.max_products` (Free: 5, Pro/Business: unlimited). Soft-vs-hard delete keys off **`sale_items.product_id`** references (not `sales`).

**A sale is a header + lines, and a line sells a product OR a service.** One sale can hold **several lines** in any mix (a small "cart") — products only, services only, or both, but at least one of something. The account/transaction lives on the `sales` header; each thing sold is a `sale_items` row. This mirrors the `customers` → `customer_plans` header/line split. See **Services** below for what a service line is and is not.

- **`sales` (header)** — one transaction: `items_summary`, `total_amount`, `currency_id` + `rate_per_usd_snapshot`, `customer_id`, `recorded_by_user_id`, `sold_at`, void fields. It holds **no money and no custody**: what the sale OWES is its `charges` row (`kind = 'sale'`, written in the same transaction) and what was COLLECTED is a `collections` row — which is what lets one sale take installments. `Sale.amountPaid` still exists in the domain type but is **derived**, filled by `SaleService.withMoney` from the bill's balance.
  - `items_summary` — a **frozen** human summary of every line (e.g. `"Water ×2, Installation"`), built by the service at create time. It powers the Sales-tab **search** and the **list / debt / wallet labels** so those stay lean (no `sale_items` join needed). Contains every line's name — products and services alike — so search matches any of them.
  - `total_amount` — the summed line totals, **app-written** at create (a generated column can't sum a child table). Snapshot, never recomputed. It is also the amount of the sale's bill, so anything still owed on it is one "sale" debt for the whole sale.
  - `rate_per_usd_snapshot` — currency rate at sale time, same drift-free principle as `payments.rate_per_usd_snapshot`. Use `paymentSnapshotCurrency(sale, currencies)` to display — it works for any row with `currencyId` + `ratePerUsdSnapshot` despite the name.
  - `customer_id` is **nullable** — walk-in sales are recorded with `customer_id = NULL`.
  - `voided_at` / `voided_by` / `void_reason` for soft-void. Voiding cascades to `sale_items` only on hard delete (FK `ON DELETE CASCADE`); a void just stamps the header. No hard delete of active sales.
- **`sale_items` (lines)** — one row per thing sold: `sale_id`, `line_type` (`'product'` | `'service'`), nullable `product_id` / `service_id`, `item_name_snapshot` (frozen), `quantity` (**always 1 on a service line** — labour has nothing to count; see Services below), `unit_amount` (frozen, in the sale currency), `voided_at` (set only when an **edit** dropped the line — see below). `line_total = unit_amount * quantity` is **derived in the mapper** (no stored column). No own `branch_id` — RLS inherits from the parent sale (`EXISTS`), like `payments` inherit via the customer. `ON DELETE CASCADE` from `sales`; `ON DELETE RESTRICT` on **both** `product_id` and `service_id` (a referenced catalog row can't be hard-deleted — including by a line an edit dropped, which is why both reference counts deliberately count voided lines too). `chk_sale_items_line_ref` keeps the type and the ids agreeing: a `'product'` line has a product and no service; a `'service'` line has no product, and **may** have no service either — that gap is the one-off typed job.
  - The name column was `product_name_snapshot` before a line could be a service. The rename is guarded inside `script.sql` and needs a matching local backfill, because the SQLite mirror is additive-only — see gotcha #99 before renaming anything else it mirrors.

**One currency per sale, auto-convert.** A sale freezes exactly one currency + one rate (the debt / wallet / dashboard math depends on it). The `SaleFormSheet` has a single sale-currency selector; when a catalog item (product **or** service) is added, its price is **converted into the sale currency** at the live rate (`convert()` in `src/core/utils/currency.ts`) as the editable per-line prefill. The first catalog item picked adopts its own currency as the sale default (until the user changes it); changing the sale currency re-prices every catalog line from its own price — a **one-off** service has no catalog price, so its typed amount is left alone. The `SaleItemsEditor` (`src/modules/transaction/sales/components/`) owns the cart rows + sale currency and reports a `SaleCartDraft` (`lines` / `total` / `currency` / `ready` / `dirty`) up to the form — mirroring `CustomerPlansEditor`'s add/remove-row pattern. An optional `initial` seeds it from a saved sale (edit mode). It answers `dirty` **itself** rather than letting the form diff its values: it re-reports the draft from an effect one render after mount, so `useDirtyForm`'s baseline would be the empty cart and an untouched edit form would prompt "discard changes?" on close (gotcha #55). The editor owns the baseline, so it owns the answer — and its signature covers `lineType` / `serviceId` / the typed name too, or flipping a row to a service would read as untouched.

**Create is header-then-lines.** `SaleService.createSale` computes the summed `total_amount` + `items_summary`, then `SaleRepository.create` inserts the header, then the lines (web: sequential insert like the customer + `customer_plans` path; offline: header + all lines in one SQLite transaction, pushed parents-before-children via `PUSH_WAVES`). List/detail reads join `sale_items(*, products(*), services(*))` — both LEFT joins, since a line fills at most one of them; the lean aggregate/label reads (`partialSales`, `heldForWallet`, dashboard totals) read only header columns.

### Services

A **service** is labour the tenant charges for — an installation, a repair visit, a router setup. Before this existed the only way to bill for one was to invent a fake product, which dragged it through the stock ledger and the derived stock expenses where it does not belong.

**What a service is:** a **line on a sale**. There is no service record, no Services tab, and no fourth money stream. That is the design, not a shortcut: every money figure in the app reads the sale's **one bill**, so services arrived in revenue, debts, the collector wallet, Reports, WhatsApp invoices and the CSV export with **no new aggregation anywhere**. Read gotcha #98 before adding a "services revenue" figure — a mixed sale raises one charge, and splitting the cash against it between goods and labour is a number the business never agreed to.

**What a service is NOT:** stocked or costed. No `stock_movements` row, no oversell check, no expense. Staff pay is still typed by hand under the `salaries` expense category. Because a service line moves no stock, every stock path narrows through `productLines()` / `savedProductLines()` in `sales/utils/saleLines.ts` — never a nullable-id test (gotcha #97).

**The price list (`services`).** Admin → Services, reached from the admin menu. The products screen minus stock and cost: name, description, price + currency, branch (`branch_id IS NULL` = SHARED), `active`. `UNIQUE(tenant_id, branch_id, name)` and the RLS pair `services_select` / `services_modify` are copied from `products` verbatim — so a **collector** can add one from the sale form the same way they can add a product, and a branch-scoped user can only write in their own branch. **No tier limit** (unlike `max_products`): services are uncapped. Soft-delete when any sale line references it (counting voided lines, since the FK is `ON DELETE RESTRICT`), hard-delete otherwise — the same two-mode `deleteService` as products, with a batch counterpart. Audited like products, with **History** on the card menu via `useRecordHistoryAction('services')`.

Layers: `src/modules/admin/service-catalog/` — repository (+ `.offline`, platform switch), `ServiceCatalogService`, `ServiceListScreen`, `ServiceCard`, `ServiceFormSheet`, and a `services` slice with the standard `loaded` guard. The business-logic class is named `ServiceCatalogService`, not `ServiceService`, because "service" is also this app's name for that whole layer — and the module folder is `service-catalog` so the file is not `admin/services/services/…`.

**Picking one on a sale.** A line's kind is decided by **which button added it** — the cart footer holds two dashed buttons, **+ Add product** and **+ Add service** — and the card then only *labels* what it sells (icon + word, plus `#n` when there are several). There is **no per-row switch**: the first shape of this editor put a full-width `Product | Service` segmented control at the top of each card, which read as a page tab bar, so tapping "Service" looked like navigating to a services list and instead silently wiped the product the user had just picked (gotcha #101). A sale holding both is therefore **two lines, never one line toggled twice**, which is also what the data model always said. A new sale opens with **zero** rows — the two buttons are the empty state — and any row, including the last, can be removed, which is how a line's kind is changed. In a service row the dropdown offers the active catalog services (priced in the sale currency, same conversion as products) plus a final **"Other — type a name"** option, which reveals a name field: that is the **one-off** — `service_id IS NULL`, and `item_name_snapshot` is the entire record of what was sold, so no catalog row is created. Adding a service inline (the dropdown's "+") prices the row from the object the form just saved, not from a store lookup, which would miss it on that render.

**A service line has NO quantity — only a price.** No stock cap, no "N left" caption, and **no stepper at all**: labour is one job at one price, so the row shows a single **Price** field which *is* the line total. Two jobs are two lines; a bigger job is a bigger number. This is enforced by the type, not by a runtime check — the `service` variant of `CreateSaleItemInput` simply has no `quantity` field, so the compiler stops any caller from multiplying one. `lineQuantity()` (`sales/utils/saleLines.ts`) is the one answer to "how many?", returning 1 for labour, and every total, summary and DB row goes through it: `sale_items.quantity` still exists and still stores **1** on a service line, so nothing downstream had to learn a special case. The receipt and the WhatsApp invoice both drop the `1 × …` prefix on a service line, because "1 × $25 = $25" is noise.

**Validation** splits by kind in `SaleService.validate`: a product line needs a real catalog row (`errors.sale_product_required`) **and** a positive integer quantity, a service line needs a non-blank resolved name (`errors.sale_service_required`) — which is also what keeps the `NOT NULL` name column legal for a one-off — and no quantity rule at all. The positive `unit_amount` check is shared.

**Edit an existing sale.** A recorded sale can be corrected in place — "I rang up the wrong product / quantity / price" no longer means void + re-record, which lost the receipt id and left a dead row in the trail. **Any staff member** may edit, from the sale row's **3-dot menu** or the receipt sheet's **Edit sale** action (all three sale surfaces: the Sales tab, the customer panel, the per-customer page). It reuses **one form** — `SaleFormSheet` takes an optional `sale` prop and switches title, button and submit path; there is no second edit form. A **voided** sale is a closed record and never offers the action (`SaleService.updateSale` refuses it, and both repositories filter `voided_at IS NULL`).

Everything the form owns can change: the lines (including swapping a product line for a service one, or the reverse), quantities, unit prices, the sale currency, the customer, the amount collected and the notes. What identifies the sale cannot: `id`, `tenant_id`, `sold_at`, and the original `recorded_by_user_id` (who made the correction is in the audit trail, not on the row). Five rules make it safe:

- **Changing the currency RE-FREEZES `rate_per_usd_snapshot`**, exactly like editing a payment (gotcha #21) — the corrected row is what every historical USD total then reports.
- **The stock ledger is swapped, not reversed.** `SaleRepository.update` soft-voids the sale's live `'sale'` movements and inserts fresh ones — the same idempotent shape as `voidSale`, never compensating opposite rows (gotcha #48). It only happens when the **per-product** unit count actually changed: `SaleService.sameStockFootprint` compares the carts by product, so a price / notes / amount-paid fix leaves the ledger untouched (and splitting one line of 3 into 1 + 2 moves nothing, so it doesn't either). **Service lines are invisible to that comparison on both sides**, so a service-only edit compares two empty footprints and correctly leaves the ledger alone; replacing the last product line with a service yields an empty replacement set, which voids the old movements and inserts none — giving the stock back exactly once (gotcha #97).
- **The sale's own units count as available while it is being re-cut.** `assertStockAvailable` takes a `credited` map (and `SaleItemsEditor` a matching stock credit), so re-pricing a sale that took the last unit isn't rejected as out of stock, and the cart's "N left" caption shows the true ceiling. The editor also keeps a product that was **deactivated** since the sale on its line — otherwise the edit couldn't re-save the line it is standing on — while barring it from a new one.
- **A dropped line is soft-voided (`voided_at`), never deleted.** The sync engine has no tombstones for `sale_items`, so a delete would live on forever in every other device's mirror. Lines are matched to the existing rows **by position**, so a line that merely changed quantity or price keeps its id and syncs as a plain update. `mapDbSaleToSale` filters voided lines out — the one place both the web and the offline read pass through — and the Sales-tab product filter skips them too.
- **A walk-in edit keeps the sale's branch.** The create rule (`customer.branchId ?? user.branchId`) would move a collector's branch sale to "no branch" the moment a tenant-wide admin corrected a typo in it, so an edit falls back to `sale.branchId` instead.

An edit **re-prices the bill and leaves every payment against it alone** — money is a `collections` row with its own date, collector and custody, so correcting it means voiding that payment, not re-typing a number here. The form shows the collected amount read-only and refuses a total below it (`errors.sale_total_below_collected`); the service refuses it too. There is **no custody lock** — a sale stays editable after its cash has been handed up the chain. One audit entry is written for the sale as a whole (`action: 'update'`, changed columns only) — `sale_items` and `stock_movements` remain deliberately un-audited, and the changed `items_summary` / `total_amount` are what report a re-cut cart.

**Receipt (`SaleDetailSheet`).** The lines get their **own card**, separate from the customer / sold-at / receipt-ID rows: an "Items" header (cart icon + line count when >1), then one row per line — numbered bubble, `item_name_snapshot` (a **service** line prefixed with a small `construct-outline` mark, so the bill shows at a glance which part was labour), a `qty × unit price` sub-line, and the line total on the right. A totals footer (Total, plus Paid / Remaining when the sale is partial) renders only when it adds information (multi-line or partial sale). The hero's caption swaps the frozen `items_summary` for a "{{count}} items" count once there is more than one line, since the summary gets long. Lean reads (empty `items`) simply skip the card.

**Row actions (`useSaleActions`).** Every sale row carries a **3-dot menu** holding everything one sale can do, so no action is reachable only by opening the receipt first: **View receipt · Edit sale · Complete · Send invoice on WhatsApp · History · Void sale**. A **voided** sale keeps only the two that still make sense (view + history) — void is final, so it is never editable, re-sendable or voidable again. The WhatsApp row stays **visible and disabled with a caption** when there is nobody to send to (walk-in) or no phone on the customer, the same "explain, don't vanish" rule the invoice selection action follows.

**Collect** appears only while the sale still owes something and has a customer (a walk-in has nobody to chase). It opens the very same `CollectSheet` every other bill uses — one door for money in, so custody, the audit entry and the currency rules are written in exactly one place. The old **Complete** action is gone with the model that needed it: `amount_paid` had no date of its own, so "he really paid in full, it was written down short" could only be expressed by rewriting the number. Now the second payment is simply recorded, on the day it happened. The hook takes an `onCollected` callback carrying the created `Collection`, and the sale form's `onCreated` / `onUpdated` carry the saved `Sale` — a list that keeps its own state (the two customer-scoped ones) patches itself from the row. The Sales tab needs neither: `ledger.collect` fans the hand-over out to `sales.applyCollection`, and the slice patches its own list and month totals on every write (gotcha #116).

The whole set is defined **once**, in `sales/hooks/useSaleActions.tsx`, and used by all three sale surfaces (Sales tab, customer panel, per-customer page) — adding an action means one edit, not three. The hook owns the `ActionMenu`, the shared-reason void dialog and the record-history sheet; the screens keep the receipt sheet and the sale form, since those carry each screen's own refresh callback. Two deliberate choices inside it:

- **One menu per SCREEN, not per card.** The debts / expenses cards each mount their own `ActionMenu`, but the sales lists are paginated and virtualized, so a per-card menu would mount a bottom sheet per visible row. `SaleCard` only raises `onMenu(sale)`.
- **One void dialog for one sale and for a selection.** `requestVoid(sales)` feeds the same `SaleBulkVoidSheet` from the card menu and from the multi-select toolbar, so a single-sale void gets the same reason box and the same `voidSales` path (its title/message have `_one` plural forms so the copy reads right for one row).

**Branch semantics:**

- `products.branch_id`: same as `plans` — `NULL` = SHARED catalog item visible to every branch.
- `sales.branch_id`: same as `customers` — `NULL` only when a tenant-wide admin records a walk-in without picking a branch. RLS scopes branch-scoped users to their own branch. `sale_items` has no `branch_id` — it inherits via the parent sale.

**`AsyncEntityPicker`** ([src/shared/components/AsyncEntityPicker.tsx](../SubsTrack/src/shared/components/AsyncEntityPicker.tsx)) is the reusable customer picker built for `SaleFormSheet`. Generic over `<T>`; the caller passes a `loadPage(search, page)` callback. Reuses `SearchTextBox`, `useDebounce` (300 ms), and a `requestToken` ref to discard stale responses when the user types fast (same pattern as `customerSlice.searchToken`). Use it any time the option list is too large to fit in memory — small static lists keep using `Dropdown`.

**Sales tab filters:** `SalesPanel` exposes a chip filter bar above the list — search (sale `items_summary` + customer name), customer (`CustomerPicker`), product (`Dropdown` over active products, lazy-loaded via `fetchProducts` on mount — the repo resolves "sales containing this product" from `sale_items`), and a **From/To date range** (`DatePickerInput` with `triggerStyle="chip"`, the two pickers constrain each other via `minDate`/`maxDate`). All non-search filters live on the `sales` slice (`customerFilter`, `productFilter`, `fromDate`, `toDate`) and flow into `saleService.getSales` → `SaleRepository.findAll`; date bounds are calendar days converted to `sold_at` timestamp bounds (end inclusive via next-day-exclusive). A "Clear filters" chip (visible only when ≥1 filter is active) resets them in one tap via `clearFilters`.

**Customer sales surfaces:** the customer detail screen renders `CustomerSalesPanel` at the **bottom** (below the payment grid + details card). The panel shows only a **5-sale preview**; when the customer has more it renders a "Show all" link to a dedicated full-page list (`CustomerSalesListScreen` at `customers/[id]/sales`) that mirrors the Sales tab (search + infinite scroll + record FAB + void) but is locked to one customer. Both surfaces keep their **list reads** independent of the global `sales` slice — the panel via `saleService.getSalesForCustomer` (with a stale-response token guard), the full page via the `useCustomerSalesList` hook — so neither clobbers the Sales tab's filter/search/list state. **Mutations, however, route through the global slice** so the Sales tab cache stays coherent: creates go through `SaleFormSheet` → `saleSlice.createSale` (unshift), and voids go through `saleSlice.voidSale` (drops the row from `sales.items`); each surface then refreshes its own local list. Neither surface applies a branch filter: they show **all** of the customer's sales regardless of the admin's current branch view.

Both customer surfaces also carry **multi-select → one WhatsApp receipt** (`useSaleInvoiceAction`): long-press a card to enter selection, tap to tick, and the send action builds a single receipt for the whole selection. The full page uses the page-header `SelectionBar` (with select-all); the **preview panel** swaps its own title row for an `InlineSelectionToolbar` with **no select-all** — five rows don't need one — inside a fixed-height (`h-9`) wrapper so entering selection can't shift the cards under the finger that long-pressed one, and it hides "Show all" while selecting. Its selection is cleared by every `refresh()`, because a new sale can push a ticked row out of the 5-row preview. Bulk **void** stays on the full page and the Sales tab only.

**Dashboard:** `DashboardService.getMetrics()` makes **one** cash read — `collectionService.collectedInRange` — plus a plain `saleService.countInRange` for the activity count. The Revenue card shows `monthlyRevenue = subscriptionRevenue + salesRevenue + manualRevenue`, with a breakdown sub-line listing only the non-zero streams. All three come from the SAME rows, split by what each one settled (`charges.kind`), so unlike the old three-query version **they add up to the total exactly**. Everything is summed in USD via each row's frozen `rate_per_usd_snapshot`, then formatted into the display currency at render.

**Revenue is CASH COLLECTED, not billed value** — and now there is only one place it can come from: `collection_items`, by `collections.received_at`. A partial payment contributes only what arrived; the remainder is a debt and enters revenue in the month it is collected, so every unit of money is counted exactly once and nothing collected is lost. Reading from the **item** side is what fixed the old breakdown: a payment against a sale debt used to land in a "debts" bucket, so sales revenue under-reported. `salesCount` is still every sale row, paid or not (`SaleRepository.countInRange`) — only the money is cash-based. Do **not** switch any revenue query back to `sales.total_amount` or `charges.amount`.

**Home analytics (expanded).** `getMetrics()` also computes a richer analytics set, all branch-scoped and USD-canonical:

- **Month-over-month** — `prevMonthRevenue`, the dashboard's only comparison figure (there is **no revenue chart**: it was removed along with `RevenuePoint`, `getRevenueTrend` and the slice's `trend` state). The hero card renders a ▲/▼ % pill ("vs last month") when the prior month had revenue. Built by `DashboardService.getMonthCollections(year, month, branchFilter)` — one private helper that returns a month's collected cash split by what it settled (plus `paymentsCollectedCount` / `salesCount`), and the **only** place the revenue query is issued: `getMetrics()` calls it twice inside its own `Promise.all` (this month for the breakdown, `month - 1` for the pill), so both figures come from the **same read**, scoped by **when the money arrived** (`collections.received_at`, never `billing_month`) — the pill compares like with like by construction, not by two code paths agreeing. `Date` normalizes month 0 into last December, so January needs no special case.
- **Growth this month** — `newCustomersThisMonth` / `cancelledThisMonth` via `customer.countCreatedInRange` / `countCancelledInRange` (by `created_at` / `cancelled_at`, `[monthStart, monthEndExclusive)`).
- **Activity this month** — `paymentsCollectedCount` (positive-amount rows in `paidAmountsForMonth`, scoped by `paid_at`) and `salesCount` (`totalsForMonth` row count). The screen derives **avg payment** = `subscriptionRevenue / paymentsCollectedCount`, shown as the "Payments" tile sub-line.
- **Total debt tile** — the one figure on the dashboard that is **all-time, not month-scoped** (it answers "how much is still outside", which has no month). `totalDebt` comes straight from `ledgerService.getDebtsView().summary.totalUsd` — the same number as the Debts screen header. Its sub-line breaks it down by kind (`monthsDebt` / `salesDebt` / `manualDebt`), and **these now sum to the headline exactly**: every row carries its own balance, so there is no gross-vs-net split left to explain. The old mismatch (and the reverted attempt to reconcile it) died with `debt_payments`.
  - `totalDebt` **also appears inside the purple hero card** as a red-tinted chip (`bg-red-400/20`, matching the card's decline pill) prefixed with a minus — `Owed by customers −$383.00` — shown only when `totalDebt > 0`. It sits below the revenue breakdown, sharing a wrapping row with the orange `Expenses $X` chip. **Only the red chip carries a minus** — spending prints unsigned, the same way `outflowLabel()` prints it on the Expenses tab, so the two screens never disagree about the sign of a cost. The tint + minus are load-bearing: everything else in that card is money **collected**, so the one figure that is money **not** collected has to read as an outflow at a glance. The tile below keeps the reconciling category breakdown; the chip is the glance-value.
  - The hero's revenue breakdown lists **Subscriptions and Sales** (and hand-typed fees when there are any). The old "hide collected debts from the breakdown" rule is obsolete: money is now filed under **what it paid for**, so cash that settled a sale debt appears under Sales — where the owner would look for it — instead of in a second debt figure beside the one that says what is still owed.
  - So the card carries **money in** (big number + streams) and **money out** (the chips) together, and they never mix: collecting a debt raises the total and lowers the red chip.

**The hero card is its own component** — `dashboard/components/RevenueHeroCard.tsx`. It owns every figure printed on the purple card and derives them itself (the month label, the ▲/▼ pill, the revenue mix, the two outflow chips, the collection bar), so the screen hands it only `metrics`, `fmt`, `showExpenses` (admin **and** something was spent — the same flag that reveals the two money-out tiles below) and an `onPress`. **Tapping the card opens the Reports tab**, and a "Reports ›" pill in its top-right says so; both the dashboard and Reports are admin-only tabs, so anyone who can see the card can open it. Without `onPress` the card renders as a plain `View` — no pill, no press feedback. Layout is flat panels rather than divider rules: the revenue mix and the Net row each sit in a `bg-white/10` inset (the old `bg-indigo-500` dividers were invisible, since `bg-primary` **is** indigo-500).

Presentation: the screen uses a shared `StatTile` (label / big value / sub-line / tone / optional icon) for the stat grid (Active, Unpaid, New, Cancelled, Payments, Sales) and the total-debt money tile. Every repo range query has a Supabase + Offline SQLite implementation behind the `ICollectionRepository` / `IChargeRepository` / `ISaleRepository` / `ICustomerRepository` seam.

**Tier-gating** is sale-blind: products consume a slot (gated by `max_products`), but recording sales is unlimited on every tier. Stock is not gated at all — restocking is unlimited.

### Stock

Every product carries a stock quantity and can be **out of stock**. Stock on hand is **computed at runtime** — `Product.stockOnHand = SUM(stock_movements.quantity_delta)` over the non-voided rows — exactly like Debts and the Collector Wallet. There is deliberately **no counter column on `products`**: the offline sync pushes whole rows with latest-`updated_at`-wins, so two devices each selling one unit offline would both write the same decremented number and one sale would vanish. Additive ledger rows merge with no conflict.

**`stock_movements`** — `product_id`, signed `quantity_delta` (never 0), `reason`, `sale_id` (only for `'sale'`), `unit_cost` + `currency_id` + `rate_per_usd_snapshot` (what the stock cost to BUY — see below), `note`, `recorded_by_user_id`, `occurred_at`, plus soft-void fields. Reasons:

| Reason | Written by | Sign |
| --- | --- | --- |
| `initial` | the "Starting stock" field on **product create** | + |
| `restock` | the product's stock sheet, "Add" — or the **batch restock** sheet | + |
| `adjustment` | the product's stock sheet, "Remove" (damage, miscount, wrong entry) | − |
| `sale` | `SaleService.createSale`, one row per line | − |

**Reading it.** Web reads the `product_stock` view — `SUM(quantity_delta) … WHERE voided_at IS NULL GROUP BY product_id, tenant_id`, declared `WITH (security_invoker = true)` so the caller's RLS on `stock_movements` still applies (**requires PG 15+**; without `security_invoker` the view runs as its owner and leaks every tenant's stock). Offline runs the same `GROUP BY` on the mirror — there is no local view. Both are `IProductRepository.stockOnHand(ids?)` returning `Record<productId, number>`; products with no movements are absent and default to 0. `ProductService.getProducts` folds the map into each `Product`.

**Branch scoping is inherited from the PRODUCT, not the sale.** The `stock_movements_all` policy mirrors `products_select` (`current_branch_id() IS NULL OR p.branch_id IS NULL OR p.branch_id = current_branch_id()`) — **not** `sale_items_all`, which inherits `sales`' *owned* semantics. Copying `sale_items_all` would hide every SHARED product's movements from a branch-scoped user, so each shared product would read as permanently out of stock and be unsellable for them. A shared product has **one** stock pool across all branches. The `WITH CHECK` also allows shared products (unlike `products_modify`): a branch user who can *sell* a shared item must be able to write its movement.

**Writing it.**

- **Sale create** — `SaleService.createSale` builds one negative `'sale'` movement per line and passes them in `CreateSalePayload.movements`. The repository writes them alongside the header + lines (offline: the *same* transaction), so a sale can never exist without the stock it consumed.
- **Sale void** — the sale's movements are **soft-voided** (`UPDATE … WHERE sale_id = ? AND voided_at IS NULL`), not reversed with opposite rows. One statement, independent of line count, and idempotent — a repeat void is a no-op instead of returning the stock twice. Bulk void inherits this for free (`saleSlice.voidSales` loops `saleService.voidSale`).
- **Manual** — `ProductService.addStock` appends a single `restock` row. **A manual entry only ever ADDS** — there is no "remove from stock" form: a delivery that was mistyped, never arrived, or was logged twice is fixed on the entry that recorded it (see [Editing a stock entry](#editing-a-stock-entry) and [Reverting a stock entry](#reverting-a-stock-entry)). A row is never deleted, and a `'sale'` row is never touched by hand.
- **Batch restock** — `ProductService.restockMany(entries, tenantId, note, userId)` appends one `restock` row **per product** in a single `addMovements` call (offline: one transaction), then returns the fresh on-hand map so `productSlice.batchRestock` updates the list without a refetch. One arriving delivery = one save, but the per-product history stays exactly as detailed as the one-at-a-time path — there is no "batch" reason and no grouping row. The shared note is copied onto every row.

**Blocking.** `SaleService.createSale` calls `assertStockAvailable` after `validate()` — a **fresh** `stockOnHand` read (the store can be minutes stale), summing the requested quantity **per product across all cart lines** (the same product can sit on two rows). Throws `errors.sale_out_of_stock` / `errors.sale_insufficient_stock`. Because it lives in the service, every entry point is covered (sale form, quick actions, customer screens). `SaleItemsEditor` mirrors it as a soft guard: out-of-stock products stay listed but greyed via `DropdownOption.disabled`, the quantity stepper caps at *on-hand minus what other rows already took*, each row shows "N left", and an oversold cart reports `ready: false`. The check is **advisory** — two offline devices can still each sell the last unit, and the DB deliberately allows a negative total (gotcha #48).

**UI.** `ProductCard` shows a green "N in stock" / red "Out of stock" / red "Short by N" chip. `ProductStockSheet` (product row menu → "Adjust Stock", or the link on the edit form) shows the current on-hand, a quantity + cost + note that only ever adds, and the last 20 movements as a bordered list: a reason icon tinted by direction (green adds / red removes), the reason, date **and** time (`formatDateTime`), who recorded it (resolved from the users slice via `recordedByUserId`), the note, a **3-dot menu** on every correctable row (Edit entry · History), and a "Reversed" chip with struck-through amount on voided rows. An amber line warns when the save would push stock **below zero** — it never blocks, because the DB accepts a negative total on purpose (gotcha #48). `ProductFormSheet` takes "Starting stock" on **create only**; on edit it renders the number read-only next to an "Adjust Stock" link, so the total is never free-typed.

`ProductBatchRestockSheet` is the many-products counterpart: a search box, then every **active** product as one compact row — name, current on-hand, and a `[−] qty [+]` stepper. A row with a quantity turns indigo and previews the result (`3 → 8`), so what's included is visible without reordering the list while the user types. One shared note applies to every row, and a summary line ("N products selected · +40") sits above the save button. Quantities are held per product id, so filtering the list never loses what was already typed. Two entry points, one component: the **Restock** button beside the search box on the products screen, and **Batch Restock** in the PageHeader quick-actions menu (admin-only there, since products live in the admin tab that non-admins never see).

**Cost — the money side of the ledger.** A movement can carry what one unit cost to buy: `unit_cost` + `currency_id` + `rate_per_usd_snapshot`, written together by `ProductService.movement()` or all three null. That is the **only** money on `stock_movements`, and it is what makes buying stock an expense (see [Expenses](#expenses)). `products` also gained `cost_price` + `cost_currency_id` — a *default* that pre-fills the restock forms, live like `price` and never frozen; each delivery freezes its own cost on its own movement. Everything is optional: a restock with no cost still records the stock and simply adds no expense, which is also what every legacy row does. A `'sale'` movement never carries a cost (stock leaving is not money leaving) — `movement()` enforces that one.

**Cost is typed in three places:** the product form's **Cost price** field (the default, plus the opening stock's cost on create), the stock sheet's **Cost per unit** / **Total cost** pair (see below), and the **batch restock** sheet, where one **delivery currency** is picked for the whole save and each picked row opens a cost line seeded from its product's cost price, converted at the live rate (the `SaleItemsEditor` rule — changing the delivery currency re-prices every row). The stock history shows a costed row's money ("Cost: $X", or green "Money back: $X" on a negative row), so which rows moved Expenses is visible.

**A stock expense comes back down through the ENTRY, never through a second row.** `amount = quantity_delta × unit_cost`, so a *negative* costed row is a negative expense — a credit — but **no new one can be written**: the stock sheet has no Remove mode, so the two doors are **Edit entry** (the row says 12, the delivery was 10) and **Revert entry** (the row should never have existed). Both take the money off the **entry's own month**, which is what a mistyped delivery needs — correcting a July delivery in August drops July's expense and leaves August alone. The credit shape stays supported for the negative rows older data already holds, and for editing one of them; it is simply not something staff can create any more.

**What has no door any more:** stock that really left later — damaged, lost, stolen, or returned to the supplier. Those were the empty-cost and the costed *removal*, and both went with the Remove mode. The count now comes down only by selling, or by editing the entry that put the units there — which rewrites that entry's own month instead of recording a later event.

**Per unit or per delivery — both are typeable, and each fills the other.** A supplier invoice states one or the other ("4.50 each", "45 for the lot"), so the stock sheet puts **Cost per unit** and **Total cost** side by side: typing either one recomputes the other from the quantity (`total = unit × qty`, `unit = total ÷ qty`). Only **`unit_cost`** is ever saved — the total is a way of entering it, not a column — so the derived unit keeps **8 decimals** (what `stock_movements.unit_cost` stores): rounding 100 ÷ 3 to 33.33 would make the recorded expense 99.99 and disagree with the invoice that was typed. **The last field staff typed is the anchor**, so changing the quantity afterwards recomputes the *other* one and never overwrites what they entered — typed a 45 total, then fixed 10 units to 12, and the unit becomes 3.75 while the total stays 45. Everything else keeps the per-unit field as the source of truth: an abandoned edit and picking Edit on a row both reset the anchor to "unit". One currency for both — the picker sits on the per-unit input and the total is locked to it, since a movement stores one currency.

#### Editing a stock entry

A **manual** movement can be corrected in place — `ProductService.updateMovement` → `IProductRepository.updateMovement`, reached from the history row's 3-dot menu → **Edit entry**. It is one of the **two** doors into "the stock number is wrong"; the other is [Reverting a stock entry](#reverting-a-stock-entry):

| | **Edit the row** | **Revert the row** |
| --- | --- | --- |
| What happened | the entry was **written** wrong (12 typed for a 10-unit delivery, a cost of 0.50 the invoice says was 0.45) | the entry should **not exist** at all (logged against the wrong product, saved twice) |
| The history says | 10 arrived | the row stays, struck through and chipped "Reversed" |
| The month that moves | the entry's **own** month — July becomes $5.00 | the entry's **own** month — July's $6.00 goes away |

Both look backwards, and that is now the whole story: a manual entry cannot *remove* stock, so "12 arrived, then 2 went back" is a shape the ledger no longer writes (it did until this change — gotchas #94 / #96 keep the reasoning, and older data can still hold such a row).

**What may change, and what may not.** Only **quantity**, **cost + currency** and **note**. `occurred_at` is locked (it is what decides which month the money counts in — moving it is what the two-doors rule exists to avoid), and so are `reason`, `product_id` and the row's own identity. `UpdateStockMovementPayload` is the type that says so.

Four guards live in the **service**, so every future caller inherits them:

- a `'sale'` row is refused (`errors.stock_movement_sale_locked`) — `SaleService` swaps a sale's movements when the sale is edited, so a hand-edit would leave the sale saying 3 sold and the ledger saying 1;
- a **voided** row is refused — it is already dead;
- the quantity arrives as a **magnitude**, and the sign is taken from the existing row, so a correction can structurally never turn stock added into stock removed (that is a new event, not a fix);
- **oversell is not blocked**, only warned about in the sheet — editing a delivery of 12 down to 10 after 11 were sold lands on −1, and negative stock is legal by design (gotcha #48).

**The rate only re-freezes when the cost actually moved.** Changing the amount or the currency re-snapshots `rate_per_usd_snapshot` at the live rate (the payment/sale edit rule, gotchas #21 / #90); editing only the quantity keeps the old rate, or a 2-unit fix would silently re-value a months-old purchase at today's rate. `ProductService.costFields()` is the one place that builds the cost trio, shared with `movement()`.

**Editing is why `stock_movements` is now audited** — see [Audit Trail](#audit-trail). Nothing else would remember that the row once said 12: the ledger is the only record of a manual movement, and an in-place edit overwrites it. Only an **edit** or a **revert** writes an audit entry (the insert would just duplicate the stock history), the entry is filed under the parent **product's** branch and name (`auditedUpdate`'s new `audit` option — a movement owns neither), and the same trail is readable from the row's own **History** action.

**UI.** One form does both jobs, like `SaleFormSheet`: picking Edit fills the sheet's quantity / cost / note from the row, puts an "Editing this entry" banner above it (direction locked, with a Cancel ✕ and a one-line note on when an edit is the wrong tool), and turns the button into "Save Changes". The tapped row sits far below the form, so picking Edit also **scrolls the body back to the top** (`scrollBody.current?.(0)`, the handle `FormSheet` fills through its `scrollRef` prop — a ref and not a context, see gotcha #102) — otherwise the filled fields and the banner stay off-screen and the action looks like it did nothing. Saving **keeps the sheet open** and reloads the history — a correction is only believable next to the rows it fixed — and resets the form to its first-render state so the unsaved-changes guard stays quiet.

#### Reverting a stock entry

The edit door's sibling, for when the entry should never have existed at all — a delivery logged against the wrong product, a duplicate save, an adjustment somebody typed on the wrong row. Reached from the same 3-dot menu (**Revert entry**, red, last), behind a confirm dialog, and open to **any staff member** like the edit.

**It is a soft-void, not a row deletion.** `voided_at` + `voided_by` are set, and both derived numbers fix themselves: the row leaves the stock sum (`product_stock` / the mirror's `GROUP BY` count only live rows) and, if it carried a cost, it leaves Expenses. The row stays in the history, greyed out with the "Reversed" chip that a sale-voided movement already wears — hard-deleting it would take away the only answer to "where did the other 12 bottles go", and the ledger is deliberately a record of what staff did, not just of the current total (rule 7, no hard deletes).

**The month is the entry's own, exactly like an edit.** Reverting says the entry was never real, so the money comes off the month the entry belongs to: a July delivery reverted in August leaves August untouched and drops July's expense. There used to be an opposite door — a costed *removal*, which credited the month it was recorded in — but the stock sheet's Remove mode is gone, so only older data holds such a row (see [Stock](#stock) → cost, gotchas #94 / #96).

**Refused for the same rows an edit is refused for, in the SERVICE.** `ProductService.revertMovement` and `updateMovement` share one guard — `liveManualMovement(id)` — so a `'sale'` row (its movements belong to the sale, which swaps them itself) and an already-reverted row are turned away wherever they are called from, not merely hidden in the menu. `stock_movements.voidMovement` is the one write, audited as a **`void`** with the parent product's branch and name, so "who reverted this and when" is answerable — and the reverted row's menu keeps its **History** action for exactly that (Edit and Revert are gone; a `'sale'` row still opens no menu at all).

**UI.** The confirm dialog names the entry ("Stock added +12 will stop counting…") and says what happens to the totals. On success the sheet stays open and reloads the history, so the "Reversed" row is visible immediately, and a form still filled from that row is reset — otherwise Save Changes would sit there pointing at an entry that no longer counts.

See gotchas #35, #36, #37, #48, #88, #89, #94, #96.

---

## Reports

The Home dashboard answers one question — "how is **this month** going?" — with fixed tiles for one fixed period. The Reports tab answers "how is the business going, over any period I choose". It is a small number of curated sections, not a query builder: an ISP owner reads them, not a data analyst.

**Admin-only**, the same gate as Expenses and the dashboard — the tab is hidden with `href: isAdmin ? undefined : null`, so the route is not even in the tab bar for a collector.

### The page

`PageHeader` (with the branch chip and a CSV export button) → `PeriodPicker` → a `SegmentedTabs` section switcher → the section's cards. Phase 1 ships **Money** and **Debts**; Customers and Staff/Products are phase 2 and drop into the same shells.

**Period** (`src/core/utils/dateRange.ts`) is one primitive: `ReportPeriod { preset, fromDate, toDate }` with presets *This month · Last month · Last 3 / 6 / 12 months · This year · Custom*. Every preset is **whole calendar months** — it always ends on the last day of its final month — so its buckets and its comparison window are the same shape. `previousPeriod()` shifts a month-aligned period by whole months and anything custom by its own day count. The file also holds the app's `dayStartIso` / `nextDayStartIso` / `rangeFromDays` helpers, which four repositories and the expense slice used to carry privately.

### Money

| Block | What it shows |
| --- | --- |
| KPIs | Collected · Spent · Net · Margin, each with a ▲/▼ pill vs the previous period of the same length |
| Money in | Breakdown by stream, with an inline share bar |
| Money out | Breakdown by expense category (including the derived `stock` half) |
| Collected by currency | What was **physically** collected in each currency, each printed in its own currency with a `≈` display-currency value beside it |

### Debts

| Block | What it shows |
| --- | --- |
| KPIs | Still owed (**all time**) · Collected on debts (**this period**) · Customers owing · Behind on payments (**counted to today**, so this one does not move with the period) |
| Who owes the most | Top 10 debtors, each with how many months they are behind, tappable through to the customer |
| What is owed for | Gross by debt category (months / sales / custom) |

Only one figure here is period-scoped. See gotcha #91 — outstanding debt is all-time by design, and the two are labelled apart on purpose.

### How the data is built

Two arrays feed almost everything, and both come from code that already existed.

**Money out needs no new query at all**: `ExpenseService.getExpensesView` already returns `ExpenseItem[]` carrying date, amount, currency, frozen rate, branch, staff, category and product — with the derived stock half merged and the branch semantics of gotcha #88 applied.

**Money in** is three new reads, one per stream, all returning the same `CollectedRow` shape:

| Repository | Method |
| --- | --- |
| `ICollectionRepository` | `collectedInRange(startIso, endExclusiveIso, branchFilter)` — ONE read, one row per bill settled |
| `ISaleRepository` | `collectedInRange(…)` |

Each lives on the repository that owns its table (never a cross-table `ReportsRepository`, which would have to re-derive the branch scoping `BRANCH_SCOPES` already encodes), and each has a Supabase impl and an offline SQLite twin. `ReportsService` tags them with their `stream` and merges them into one `CashRow[]`.

Everything else — by stream, by category, by currency, the comparison, and every drill-down — is **pure client-side aggregation** in `reports/utils/aggregate.ts` (`sumByKey`, `topN`, `shareOfTotal`, `delta`). **One query per stream per window**, so a 12-month report costs the same round trips as a 1-month one.

Revenue is **cash collected**, exactly as on the dashboard, and from the same one read: `collection_items` by `collections.received_at`, each summed in USD via the collection's frozen `rate_per_usd_snapshot`. Reports and dashboard must reconcile to the cent for a single month — that is the acceptance test, and it is now hard to fail, because both call `CollectionService.collectedInRange`.

### Drill-down

Tapping a breakdown row or the debts card opens `RecordsSheet` with the records behind that number. It is always a **filter over rows already in memory** — never a second query — which is also what guarantees the rows add up to exactly the figure that was tapped.

### Export

The header's download button writes the section as CSV and hands it to the system share sheet (`expo-file-system` + `expo-sharing`); on web, where `expo-sharing` is a no-op, it falls back to a plain browser download. `src/shared/lib/csv.ts` does the RFC-4180 quoting and writes a UTF-8 BOM, so a customer name with a comma does not split a cell and Arabic opens correctly in Excel. The money sheet writes spending as **negative** rows, so its Amount column sums to the report's Net.

### Reusable pieces

A phase-2 report is a config object plus a data hook, because the presentation is already built: `ReportSection` (loading / error / empty / pull-to-refresh), `KpiRow`, `ReportCard`, `BreakdownList`, `RankedList`, `ComparisonPill`, `CurrencySplit` and `RecordsSheet`, with one palette in `reports/utils/reportColors.ts` so a stream keeps its colour on every card.

**There are no charts.** A charting library (`react-native-svg` + `react-native-gifted-charts`) was fitted and then taken back out — the numbers, the share bars and the drill-downs carry the reports on their own, and the library cost a native rebuild for decoration. Do not reintroduce one without a figure that genuinely cannot be read as a list.

Three things moved out of single-use homes on the way, and the reports then reuse them rather than re-writing: `StatTile` → `src/shared/components/`, the date-range helpers → `src/core/utils/dateRange.ts`, and the wallet's per-currency fold → `groupByCurrency` in `src/core/utils/currency.ts`.

### Release

This is **not** an OTA release. `expo-file-system` and `expo-sharing` (the CSV export) change the native fingerprint, so the installed build can never receive it — `npm run build-prod` plus a reinstall is required. The range reports scan `collections (tenant_id, received_at)`, which the ledger schema indexes. No table or column changes — the whole feature is read-only.

---

## Expenses

The app counted only money **in** — every hand-over summed into `monthlyRevenue`. Expenses are the other half, so the dashboard can answer "did I actually make money?". **Admin-only end to end** (RLS on the table, and the UI drops the segment, the quick action and the dashboard tiles for anyone else): rent and salaries are not staff business.

**Two sources, one view.** `ExpenseService.getExpensesView({ startIso, endExclusiveIso, branchFilter })` composes them into a uniform `ExpenseItem[]` + a USD `ExpenseSummary` — the same shape `LedgerService` uses (stored rows + a derived stream from another service):

| Source | Where it comes from |
| --- | --- |
| `manual` | Hand-typed rows in the `expenses` table (rent, salaries, fuel, …) |
| `stock` | **Derived** at read time from `stock_movements` — costed, non-voided, non-`'sale'` rows; `amount = quantity_delta × unit_cost`, so a costed **negative** row is a negative amount (money back) — older data only, since a manual entry can no longer remove stock |

**A restock never writes an expense row.** Deriving it means correcting the stock corrects the expense, with no second insert inside the offline restock transaction, no drift on a void, and no orphan when a hard-deleted product takes its ledger with it. The cost of that choice is that a derived row **cannot be voided** (`ExpenseItem.canVoid` is false; its 3-dot offers "Open product") — a wrong cost is fixed on the entry that carries it — **Edit entry** for a mistyped one, **Revert entry** for one that should never have existed — and both take the money off the month that entry belongs to (see [Stock](#stock) → cost, and gotchas #94 / #96). Row ids are prefixed (`exp:` / `stock:`) so the two sources can never collide.

**Credits print `+`, in green.** A negative amount is the one figure on this screen that is not money leaving, so `outflowLabel()` — used by the card, the total-spent headline and every month section total — flips the leading `−` to `+` over the absolute value. Without it a credit reads `−-$5.00`. Its label says what it is (`Water ×2 returned`) instead of `×-2`.

**Cash basis, exactly like revenue.** A purchase counts in the month it was **paid for**, never the month the goods sell — no FIFO, no cost layering, and unsold stock is inventory rather than a loss. Manual rows key off `incurred_at`, a **user-picked date** (last month's rent entered today belongs to last month), not `created_at`.

**`expenses` table** — `branch_id` (its **own**, `NULL` = a company-wide expense), `category` (free text at the DB level; the app owns the code list, so a new category needs no migration), `description`, `amount` + `currency_id` + `rate_per_usd_snapshot` (the standard frozen-rate trio), `recorded_by_user_id`, `incurred_at`, soft-void fields. **Void-only, no edit** — a typo is voided and re-entered, so the row is its own history and the table is deliberately **not audited** (the same call as the debt tables). No tier gating.

**Branch semantics: one rule, and it is `owned` on both halves.** `expenses.branch_id` is `owned`, and NULL means **the company bought it, no branch did** — so a company-wide expense shows in the **All branches** view only (the "Unassigned" chip reaches it on its own). The *derived* half follows the same rule via the parent **product**: `stock_movements: { kind: 'inherited', joinedTable: 'products' }`, deliberately narrower than the stock RLS policy. Both exist for the same reason — **branch views must sum to the tenant total**. Making either one `shared` puts head-office rent, or a shared product's delivery, into every branch's expenses at once, and two branch admins each read the same money as theirs. The RLS policy is wider than the app filter on purpose: visibility and aggregation are different questions. Gotcha #88.

**UI.** An **Expenses** segment in the Transactions hub (admin-only) plus an "Add expense" quick action. `ExpensesPanel` reads a **date window** (the current calendar month by default) rather than paginating, so section totals are always the local sum: a total-spent headline with a stock/other split, search + category + From/To chips, then a month-grouped `SectionList` via the shared `groupByMonth` / `MonthSectionHeader`. Every amount carries a leading `−`. `ExpenseFormSheet` is the `CustomDebtFormSheet` shape (category `Dropdown`, `CurrencyInput`, `DatePickerInput` capped at today, branch picker, description).

**Dashboard.** `DashboardMetrics` gains `monthlyExpenses` / `stockExpenses` / `customExpenses` / `netIncome`. **`monthlyRevenue` stays GROSS** — `netIncome` is the subtraction, so `prevMonthRevenue` and the vs-last-month pill keep their meaning. The hero card gains an orange `Expenses $X` chip (unsigned, like `outflowLabel()` on the Expenses tab) beside the red "Owed by customers −$X" one (orange vs red because they mean different things — money already spent vs money not yet collected) and a `Net this month` line, red when negative; two full-width tiles follow. Admin-only throughout: `getMetrics` reuses the wallet's `viewer` gate.

**Code map:** `src/modules/transaction/expenses/` (repository + service + `expenseCategories.ts` + panel/card/form), the `expenses` slice + `useExpenseSlice`, `stockCostsInRange` on `IProductRepository`. See gotchas #88, #89 and #94; QA [expenses.md](../QA/expenses.md).

---

## WhatsApp Invoices

Staff can send the customer a **plain-text receipt over WhatsApp** — at the moment the money is taken, or later from the saved record. It is a `wa.me` deep link end to end: no PDF, no printing, no new dependency, no DB change, no server work. Everything lives in the small `src/modules/invoicing/` module.

**The module (4 files).**

- `utils/invoiceText.ts` — **pure** builders, no React and no i18n singleton: `t` arrives inside an `InvoiceContext { t, orgName, locale, currencies, displayCurrencyId }` (the same "pass `t` in" pattern as `blockRangeLabel.ts`). Exports `buildPaymentInvoiceText(ctx, customerName, rows)`, `buildSaleInvoiceText(ctx, sale, customerName)` and `buildSalesInvoiceText(ctx, sales, customerName)` (which falls back to the single-sale layout for one row, so a lone sale always produces the same document). It is **not a Service** — it decides nothing, validates nothing, throws nothing. It lives in a module rather than `src/core/` only because it reuses `getBlockRangeLabel`, and Core may not import from a module.
- `utils/invoiceRecipient.ts` — pure: collapses the rows of a multi-row receipt to the ONE customer it can be sent to, or names why it can't (`mixed` / `no_customer` / `no_phone`). Callers map their own row type down to `InvoiceRecipientRow { customerId, customerName, phone }`.
- `hooks/useSendInvoice.ts` — the one place that turns a saved record into a message. Gathers the context from the stores (`useAuthSlice` tenant name, `useCurrencySlice`, `useDisplayCurrencyId`, `useLanguageStore`, `useTranslation`), calls `openWhatsApp`, and on a `false` result shows the `confirm({ hideCancel: true })` dialog. Returns `{ canSend, resolveRecipient, sendPaymentInvoice, sendSaleInvoice, sendSalesInvoice }`; `resolveRecipient` is the recipient util plus the dialog that explains a refusal.
- `components/SendOnWhatsAppButton.tsx` — the app's single green (`bg-[#25D366]` + `logo-whatsapp`) action row. Matches `Button`'s geometry but is its own component because `Button` takes no icon and no `className`. `ContactToUpgradeButton` was re-pointed at it, so that markup now exists once.

**Entry points.**

| Where | Action |
| --- | --- |
| `CollectSheet` | (via each surface's own send flag) the hand-over it writes is sent as one receipt |
| `SaleFormSheet` | a second, stacked button — **Save & send on WhatsApp**, using the `Sale` `createSale` already returns |
| Quick pay — month-cell menu (`CustomerPaymentPanel`) + customer-card menu (`CustomerListScreen`) | a **Pay & send on WhatsApp** row beside "Quick pay" |
| **Month-grid multi-select** (`InlineSelectionToolbar`) | a green WhatsApp action beside "Collect" — one receipt for the hand-over it writes |
| `BillSheet` / the money-in history row menu | **Send on WhatsApp**, to re-send a saved hand-over any time |
| `SaleDetailSheet` + the three sales lists | **Send invoice on WhatsApp** — one sale, or one receipt covering a selection |

Stacked, not side-by-side: `Button` takes no `className`, and the long label (and its Arabic form) truncates at half a phone width.

**Both busy states are one marker, not two flags.** Each form tracks `busyOn: "save" | "send" | null`, set **before** the write and cleared in a `finally`, so the spinner stays on the button the user actually pressed across both phases (the store write, then the awaited deep link). Consequently `canSubmit` / `submitDisabled` are **validity-only** — folding the slice's loading flag into them greys out *both* buttons, and a disabled `SendOnWhatsAppButton` shows no spinner at all.

**No phone → visible but disabled, with a caption.** `canSend` digit-strips exactly like `openWhatsApp`, so `"-"` or `"n/a"` disables rather than producing a broken link. The button caption is `invoice.no_phone`, or `invoice.no_customer` for a walk-in sale; the menu rows use `ActionMenuItem.caption` for the same hint. **A voided hand-over or sale never shows the button** — a cancelled receipt is not a receipt.

**A receipt is ONE hand-over, and that simplified the whole builder.** `buildCollectionInvoiceText` replaced the old multi-row payment builder, and three rules it needed simply stopped existing:

- **One currency**, because a collection is single-currency — so no "one Total per distinct currency" any more, just one amount.
- **One date**, because a hand-over happens once — so no "date each bullet when the rows weren't collected together".
- **One customer**, because a collection belongs to one — so no `resolveRecipient` refusing a mixed selection.

What is left is the split: a hand-over that settled one bill names it above the amount, and one that settled several lists them as bullets under **"This pays"**, oldest bill first. The old rules were all workarounds for receipts assembled out of unrelated rows; the model now produces the receipt directly.

**Message format** (owned entirely by `invoiceText.ts`): `*Org name*` bold header + a receipt title, then `Label: value` lines, list rows prefixed with a literal `•`, and an `invoice.thank_you` footer. Amounts are `formatMoney(v, source, source)` where `source = snapshotCurrency(row, currencies)` — the literal cash at the row's frozen rate — with a ` (≈ …)` display-currency suffix on the **one** headline amount only. The date uses `getDateLocale(language)`, which always returns `en-US`: `formatMoney` hardcodes Latin digits, so an `"ar"` date would mix numeral systems inside one message.

**A multi-plan or multi-month collection is naturally one message**, because it is naturally one row. `CustomerListScreen`'s "collect all due" groups a customer's lines **by currency** and writes one collection per group (a collection cannot mix currencies), so a customer billed in two currencies receives two receipts — which is correct: he handed over two piles of cash.

**Several sales still need the multi-row builder**, and `buildSalesInvoiceText` is unchanged: a sales-list selection is genuinely a set of unrelated records, so it keeps the oldest-first sort, the per-currency totals and `resolveRecipient`'s refusal of a mixed selection.

**Getting the created record back.** `ledger.collect` returns the created `Collection` (no new state field), which is all a receipt needs — the header, its split, and its id.

See gotchas #68, #69, #80. QA: [../QA/whatsapp-invoices.md](../QA/whatsapp-invoices.md).

---

## Transactions Hub

The bottom **Transactions** tab (`app/(app)/(tabs)/transactions`) is a hub hosting in-page segments via the shared `SegmentedTabs` control: **Debts** (default), **Sales**, and — for admins — **Expenses**. `TransactionsScreen` owns the page chrome (SafeAreaView + title + `BranchSelector` + segments); each segment is a self-contained **panel** that owns its own body (filters, list, sheets, multi-select) but not the chrome. The selection toolbar that used to live inside `PageHeader` was extracted into a shared `SelectionBar` so panels (which have no `PageHeader`) can render it; `PageHeader` re-uses `SelectionBar` and re-exports `SelectionAction` for back-compat. While a panel is in selection mode it **replaces its filter row** with the single `SelectionBar` (see the shared selection row below).

- **Debts** → `DebtsPanel` (see [The Ledger](#the-ledger-charges--collections) — `ledger` slice).
- **Sales** → `SalesPanel` (the former `SalesListScreen` body, behavior unchanged — `sales` slice).
- **Expenses** → `ExpensesPanel` (see [Expenses](#expenses) — `expenses` slice). **Admin-only**: the segment is dropped from the array entirely for a non-admin, matching the RLS on the table.

> **There is no Services segment.** It existed as a "coming soon" placeholder and was **removed** when services shipped, because a service turned out to be a **line on a sale** rather than its own record — so the Sales tab already lists every one of them, and the price list belongs at Admin → Services. See [Products & One-Off Sales → Services](#services).

> **The money-in history is a sheet, not a tab.** `CollectionsPanel` lives in a
> full-height bottom sheet (`CollectionsHistorySheet`) launched from the
> **PageHeader 3-dot quick-actions menu** ("Money received", first item) on any
> screen, riding the same `ui`-slice / `QuickActionSheets` seam as the other
> quick-add sheets. It is **one** list where there used to be two: a month, a
> sale and a custom fee are all settled by the same `collections` row, so the
> payments history and the debt-payments history had nothing left to keep apart.
>
> **Voided hand-overs STAY in the list, marked** — history is a record of what
> happened, so the read passes `includeVoided: true` and `voidCollections`
> **merges** the voided rows back into `items` instead of dropping them. Money
> never counts one: `monthlyTotals` excludes voided rows server-side, and the
> panel's own per-row sum returns 0 for them. The **month grid is untouched** —
> it keys off collected money, and a voided collection contributes none.

**Month-grouped lists.** Sales, Payments, and Debts all render as a `SectionList` grouped by calendar month, newest first — one section header per month ("This Month" for the current month, else "June 2026"). The two newest buckets break out ahead of the months: **Today** (`common.today`) and **This Week** (`common.this_week`, Monday-based week start, excluding today) — a row lands in exactly one bucket (today → this week → its month). The grouping is a pure view transform (`groupByMonth` in [monthSections.ts](../SubsTrack/src/shared/lib/monthSections.ts)) over the **already date-desc-sorted** slice data, so the slice/service stays the single source of sort order — it only buckets, it never re-sorts. Day/week bucket totals are always summed locally (their newest rows are guaranteed loaded); a month whose newest rows were peeled into Today/This-Week has that peeled USD subtracted from its authoritative `totalsByMonth` total so the header still reads the correct remainder. Each panel supplies the row's date: Sales → `soldAt`, money received → `receivedAt`. (Debts is a flat debtors list — it has no month sections.) Headers render via the shared `MonthSectionHeader`; sticky headers are disabled. Selection / select-all still resolve against the flat slice array (the sections are built from it), so multi-select is unaffected. Full month names come from the `months_long` i18n block; "This Month" from `common.current_month`.
  - **Month totals.** Each panel also passes `groupByMonth` a `getAmountUsd` row-to-USD function, so every section carries a `totalUsd`; `MonthSectionHeader` renders it (formatted into the display currency) at the trailing edge of the header, next to the row count. Sales sum the **value sold** (`totalAmount`, matching `soldAt`); the money-in history sums the **cash received** (`amount / ratePerUsdSnapshot`, matching `receivedAt`). (Debts no longer uses month sections — it's a flat debtors list; the debtor detail modal groups a customer's debts/payments via the shared `DebtList`.)
    - **Sales/Payments are paginated (`PAGE_SIZE` = 30) — summing only the loaded rows would under-count any month with more rows than one page.** Both panels instead pass `groupByMonth` a 5th arg, `totalsByMonth: Record<"YYYY-MM", number>`, which — for any month key present — overrides the local per-row sum. That map comes from `saleSlice`/`collections`'s `monthlyTotals` state, refetched (in parallel with the paginated page) every time filters change via `SaleService.getMonthlyTotals` / `CollectionService.getMonthlyTotals`, and **patched in place after a write** by `addMonthTotal(totals, iso, deltaUsd)` — recording, correcting or voiding a row moves its month by that row's value instead of re-running the aggregate (a month the map does not hold is left alone: it was never fetched, so `groupByMonth` is already summing it locally), which bucket `SaleRepository.monthlyTotals` / `CollectionRepository.monthlyTotals` — the **same filters as `findAll`, but unpaginated and projected to just the 2–3 numeric columns needed to sum** (no joins beyond what a search/branch filter needs), so it stays cheap even over a whole table. `fetchMoreSales`/`fetchMoreCollections` (loading further pages of an unchanged filter set) do **not** refetch it — the total doesn't change, only which rows are visible. Debts isn't paginated (it loads its full filtered set up front), so it never passes this arg and keeps summing locally.

**Money received (tenant-wide):** `CollectionsPanel` lists every hand-over of
cash across all customers, newest first, defaulting to **this month**. Backed by
the `collections` slice + `CollectionRepository.find` +
`CollectionService.getHistory` (returns `CollectionListItem` — the header, its
split, the joined customer name and phone, and the one `kind` every line shares
or `'mixed'`). Branch scoping is the collection's **own** `branch_id` (gotcha
#103). Multi-select enables bulk void. The per-customer `payments` slice and the
month grid are untouched.

**The card answers four questions, in reading order** — who paid, how much, what
it paid, who holds the cash: the **customer's name** leads (bold, left) with the
amount bold on the right, the second line **names the bills** (`collectionLabel`
— the first two labels, then `+N more`; a bare "3 items" count named nothing),
and the third is the **collector** plus the moment the cash arrived, printed to
the **minute** (`formatDateTime`). The kind is told **twice**: by the **icon's
colour** and by a **kind chip** in words (Month / Sale / Custom / Mixed), both
read off one `KIND_STYLE` row (month and sale emerald — a sale is emerald
app-wide, so the receipt glyph parts them — manual violet, mixed indigo). The
chip was briefly dropped, because one emerald badge on every kind made the list
a green wall, and it came back the moment sale and month started sharing a
colour: a glyph alone is too quiet to classify a row, so the fix is to **tint
the chip per kind**, never to delete it. The other chips are exceptions only:
`N items`, the **holder**
(amber, and only when custody has actually moved — a collector still holding
their own cash gets none), and a red `Voided` carrying its reason under a
struck-through amount. **Amounts print in the currency physically handed over**
(`formatMoneyPair`, gotcha #128), with the display-currency value as a small `≈`
line under it and only when it differs.

**Chrome:** a `PeriodPicker` (the same one Reports uses — the window is now a
visible chip instead of a silent one-month default), then chips for **Customer**,
**Collected by**, **Type**, **Status** (not voided / voided only), **Sort by**
(Received date / Recorded date / Last updated) and **Order** (newest / oldest
first), then one **summary bar** — "Collected in this view" — which sums the
slice's unpaginated `monthlyTotals`, so it covers every matching row rather than
the loaded page. **Type filters on the frozen `collections.kind`** (gotcha #128);
status maps onto `includeVoided` / `voidedOnly` and the sort onto `sortField` +
`sortDirection`, all four server-side in both repositories, so paging stays
correct. **Sort by offers only dates the hand-over itself owns** — a due date
belongs to the bills it paid, of which there can be several, and an amount sort
across currencies would have to be an expression; both are left out on purpose
(gotcha #129). Received and recorded genuinely differ, because a received date
is user-picked and can be back-dated.

**Tapping a row opens what it settled** — the bill itself for a single-bill
hand-over, `CollectionSplitSheet` when it settled several, and **always the
split for a voided row**, whatever it settled: the bill behind a reversal is
owed again, so it is no longer that row's story. A voided row used to open
nothing at all, which left the one question staff actually ask — who cancelled
this, when, and why — with no surface to answer it. So the sheet keeps the
**kind** pill and adds a red **Voided** one beside it (a void does not change
what the cash paid for), names the void's time, **its author** (`voidedBy`,
carried on `CollectionListItem` and patched into the store by `applyVoided`, so
it is right the instant you void) and its reason, heads the bills **"This had
paid"** with the caption *these bills are owed again*, and drops the custody row
entirely — a voided hand-over holds no cash, so "now with Sami" would be a lie. That sheet is the
hand-over's whole record: the total (+ `≈`), a status pill, then an `InfoRows`
block (customer · received to the minute · who took it · where the cash is now,
or "Banked" · **notes**, which were stored but shown nowhere before · the void
time and reason), then one `CollectionItemCard` per bill carrying the **bill's**
total, due date and billing instant. A bill card deliberately does **not** print
a remaining balance: that is the sum of every hand-over against the bill, so it
belongs to `BillSheet`, one tap away. `BillSheet` gained the same depth (customer,
month billed, bill total, due date, billed-at to the minute, who billed it,
notes) and now speaks the **bill's own currency** throughout — hero, remaining
and every payment row — with one `≈` display line under the hero.

---

## The Ledger (charges + collections)

Everything about money — what is owed, and what was handed over — lives in three
tables. This replaced the whole `payments` / `custom_debts` / `debt_payments`
family, and the reason is one sentence:

> `payments.amount_paid` and `sales.amount_paid` each hold **one number and one
> date**, so when a customer pays 12 now and 8 next month there is nowhere for
> the 8 to go.

Raise `amount_paid` and the 8 counts as revenue on the original date; leave it
and the row says he still owes it forever. Every debt problem the app had grew
from that: `debt_payments` was a workaround that could only point at a
*customer*, never at which month or sale it paid; debt was a customer-level
`Σ categories − Σ payments`, so no individual line's balance was trustworthy;
"Complete" existed only because `amount_paid` had no date of its own.

### The model

| Table | Role | One row = |
| --- | --- | --- |
| `charges` | what is owed — **the bill** | a month, a sale, or a hand-typed fee |
| `collections` | money physically handed over | one hand-over: "$55, 5 Mar, taken by Sami" |
| `collection_items` | which bill that money paid | one bill touched by that hand-over |

A bill can take many payments and a payment can cover many bills — a genuine
many-to-many, which is exactly why the middle table exists. Partial payments,
installments, pay-later sales and oldest-first collection then all fall out for
free, and the wallet, the dashboard and Reports each collapse to a single source.

```
balance(charge)  = charge.amount − Σ collection_items (of non-voided collections)
debt(customer)   = Σ balance where balance > 0 AND (kind <> 'month' OR paid > 0)
owed(customer)   = debt items + unpaid months from buildMonthGrid, deduped on
                   (customer_plan_id, billing_month) — the charge row WINS
revenue(period)  = Σ collection_items in the period, by collections.received_at
wallet(user)     = Σ collections where held_by_user_id = user, per currency
```

**Nothing asks "does a charge row exist?" — everything asks "how much money came
in?"** A month bill left at 0 collected (after a void) reads *identically* to no
row at all. Miss this and a voided payment leaves a ghost debt behind.

### Balance is never a column

`charge_balances` is a `security_invoker` view (the `product_stock` precedent);
offline the same `GROUP BY` runs over the mirror, so one mapper serves both. Two
devices can therefore both collect offline without clobbering a counter.

> **The view's `CASE` is load-bearing.** `p.voided_at IS NULL` sits in a LEFT
> JOIN's `ON` clause, which does not *drop* an item whose collection was voided —
> it only leaves the joined row all-NULL. A bare `SUM(i.amount)` keeps counting
> voided cash, and voiding a payment never gives the balance back.

### The waterfall

`ledger/utils/waterfall.ts` is pure — no I/O, no clock. `allocate(amount, items)`
spreads money **oldest due date first, filling each bill completely** before
moving on. Never proportional: a customer settles his oldest bill, he does not
part-pay all of them.

The sort has **four levels**, and each earns its place:

1. `dueDate` — when it HAD to be paid. Never the date it was typed, or a fee
   back-dated to 2020 would jump the whole queue (gotcha #74 in a new place).
2. `issuedAt` — a January month billed today loses to one billed last week.
3. `createdAt`
4. `keyOf(item)` — a total order, so the preview and the save can never disagree
   and two devices splitting the same money land identically.

Leftover money means **overpay**, and the service refuses it: there is nowhere
for unapplied cash to live.

#### The order is SHOWN, not just applied

An automatic split is only trustworthy if staff can see WHY the money went where
it did. So the preview is drawn in the waterfall's own order and says so:

- **`CollectSheet` re-sorts its own pool** with the same `sortByDue` before
  rendering — it never trusts the order the caller handed it over in. The Debts
  screen passes two separately-sorted lists glued together
  (`[...items, ...unpaidMonths]`), and `buildDebtsView` sorts on `dueDate` alone
  while `allocate` sorts on four levels, so without this the rows could say one
  thing while the money did another.
- **`AllocationPreview`** (`ledger/components/AllocationPreview.tsx`) renders it.
  Each row carries its **queue number** (1, 2, 3…), its **due date** and **how
  many days late** it is. The number is **filled** once money reaches the bill
  and a **hollow outline** while it is still waiting behind the ones above it.
- **Unticking a row re-numbers the ones below it** — the rule "the money moves
  down to the next bill" shown instead of explained. A skipped row greys out,
  strikes through its label and shows a `×` badge.
- A row nothing reached prints **what it still needs**, since its status line
  ("Not covered") does not say it the way "Leaves X owing" does.

The section header carries one caption naming the rule (`ledger.waterfall_hint`),
and `daysLate()` lives in `core/utils/date.ts` — one copy, shared with
`ChargeService` and `DebtItemCard`.

### Virtual months

A month has **no charge row until money reaches it**. `LedgerService.getOwed`
therefore merges two sources — stored bills, and unpaid months derived from
`buildMonthGrid` — deduped on `(customer_plan_id, billing_month)` with a
**PAID stored bill winning**. Miss the dedupe and an empty month charge left by a
voided collection is counted twice.

An **EMPTY** stored bill (nothing collected) deliberately LOSES the dedupe: it
must read like a month never touched, price included, so the virtual month wins
and carries the line's CURRENT price. The grid takes the same branch in
`monthItemFromEntry` (`entry.collected > 0`, not `entry.charge`), and both
`CollectionRepository.create` paths re-price the stored row to match before
collecting — otherwise the sheet would show the new price and bill the old one.
A bill money has reached always keeps its frozen amount. See gotcha #106b.

Collecting is what turns a month into a bill: `CollectionService.collect`
materializes it in the same write, with an id from
`deterministicId(customer_plan_id, billing_month)` — so two devices collecting
the same month offline converge on ONE row instead of billing the customer
twice.

### A line with no set price

A custom-price plan — or a customer with no plan at all — has no figure to bill,
so `resolveLinePrice` returns `kind: 'typed'` and **`getOwed` skips the line
entirely**: nothing can be poured over a bill whose amount nobody has typed. The
month cell still collects. It builds an **open item** (`OpenItem.openAmount`,
amount / balance / currency all empty) and the collect sheet grows one extra
field, **Amount for this month** — that field IS the bill, and it also decides
the currency, since an open item has none of its own.

Three rules:

- **Single item only.** Two open months in one write are two different unknown
  amounts, so a grid multi-select containing one is refused with a message.
  Quick pay follows the same rule: one price-less line opens the sheet on the
  customer list itself, two send you to the month grid.
- **Once the amount is typed the item becomes an ordinary bill**
  (`billedOpenItem` in `CollectSheet`), so a part payment, the "leaves N owing"
  hint and the overpay refusal are the existing code, not a second
  implementation. "Owed 50, paid 20" works exactly as it does for a priced line.
- **The bill is raised at what was typed**, in the hand-over's currency:
  `CollectionService.materialize` uses `item.amount > 0 ? item.amount : line.amount`.

Once that first bill exists the line behaves like any other — the remainder is a
debt, and the Debts screen and the waterfall both see it. See gotcha #112.

### Owed vs debt

| | includes | consumed by |
| --- | --- | --- |
| **OWED** | everything with a balance, plain unpaid months included | the waterfall, and only the waterfall |
| **DEBT** | partly-paid months, open/partly-paid sales, hand-typed fees | the Debts screen |

`isDebtItem(kind, paid) = kind !== 'month' || paid > 0` — one function, in
`ledger/utils/openItems.ts`. **A fully unpaid month is NOT a debt**: it is
`unpaid`/`overdue` in the month grid, which is its own screen and its own
workflow. It becomes a debt the moment it is *partly* paid, which is exactly
when it stops being routine.

**The Debts screen never lists a plain unpaid month at all**, and that is
structural, not a filter: `getDebtsView` reads **stored bills only** (no virtual
pass — do not add one), and a month has no bill until money reaches it. So the
`unpaidMonths` section fills only from **partly-paid** months. The one leak was
an **empty** bill — a month paid and then voided keeps its `charges` row with
`paid = 0` — which made voiding a payment the single way an unpaid month could
appear there, showing that lone month while the customer's genuinely unpaid
months stayed hidden. `buildDebtsView` now drops `kind === 'month' && paid <= 0`,
so an emptied bill reads exactly like a month never touched (gotchas #106,
#106c).

### Void vs write-off

Two different statements about one bill, and `chk_charges_void_xor_write_off`
keeps them mutually exclusive:

| | means | effect |
| --- | --- | --- |
| **void** (`voided_at`) | it was a MISTAKE — it never existed | gone from every figure. `voidCharge` is refused once money sits on it; `voidChargeWithPayments` is the deliberate "take the cash with it" door (see below) |
| **write off** (`written_off_at`) | it is REAL but will never be paid | leaves "still owed", reported as a **loss** in Reports → Debts |

Voiding a **collection** is the third, and different again: the cash was real
but should not have been recorded. Every bill it touched gets its balance back
on its own, because a balance is a sum over live items and this row stops being
one.

**A dead bill still owns its month, so collecting it REVIVES it.** `charges`
is unique on `(customer_plan_id, billing_month)` whatever the row's state, so a
voided or written-off month bill is the only row that month can ever have —
while every read (the grid, the debts screen, `charge_balances`) filters it out.
Cash aimed at that month would therefore be saved onto a row nothing can see:
counted in the wallet and in revenue, but the cell red again on the next
refresh, for ever. So the write fixes its target first. `reviveTargetBill(s)`
does two INDEPENDENT things: it clears all six void / write-off columns
**unconditionally** whenever money is about to land (cash contradicts both "it
was a mistake" and "it will never be paid"), and separately re-prices an EMPTY
month bill. Keeping them independent is the whole lesson — the un-void used to
be bundled into the re-price and so ran only when the price happened to have
moved. Two supporting rules: the paid check that guards the re-price sums
`collection_items` directly (a balance read hides the very row being fixed and
would answer 0), and `charge_balances` now excludes **only** voided bills,
because a write-off gives up on the remainder and does not un-collect what was
already handed over. "No longer owed" is decided in one place,
`ChargeRepository.find`. Gotcha #115.

### One currency per hand-over

A collection carries one currency, and it must equal the currency of every
charge it pays — which is why `collection_items` has **no currency or rate of
its own**. That is what lets a balance close at exactly zero, with no rate drift.
A customer owing in two currencies is collected from twice, and the collect
sheet shows a currency picker to say so. USD for revenue and the wallet uses the
**collection's** frozen rate (what physically arrived); USD for a debt total uses
the **charge's** (what he was billed).

### Screens

| Where | What |
| --- | --- |
| `CollectSheet` | the ONE collect form. Two modes: a whole customer (type an amount, watch the waterfall split it, untick a row to steer the cash on) or a single bill. Same write either way, so one code path and one audit shape. |
 hero, then **every payment that reached it**, each with its own date and collector. |
| `BillPaymentsList` | the payments half of `BillSheet`, on its own — the list of hand-overs against ONE bill, with the per-row menu (send receipt / void this payment). Shared with the **sale receipt**, because a month and a sale are the same `charges` row to the ledger. |
| `CollectionCard` | one hand-over. A single-bill payment names it inline; several wear a `3 items` marker. **Tapping the card opens what it settled** — the bill itself, or `CollectionSplitSheet` when it closed several. A voided row is inert. |
| `CollectionSplitSheet` / `CollectionItemCard` | the bills ONE hand-over settled, each a card that opens its own bill — the split shown rather than explained. Needs no read: the list already hydrates every item's charge. |
| `useOpenBill` | "show me the bill behind this row", read-only. A month and a manual fee open the shared `BillSheet`; a **sale** opens its receipt through an injected `onOpenSale`, because the sale sheet lives in the sales module and sales depends on the ledger — never the reverse. `open(charge)` takes the bill; `openOwed(item)` takes an `OpenItem`. **Neither reads**: an `OpenItem` built from a stored bill carries that `Charge` (`openItemFromCharge`), exactly as a `CollectionItem` carries its own, and a sale needs only the `saleId` already on the row. A **virtual** month opens nothing: there is no record behind it yet. |
| `CollectionsPanel` / `CollectionsHistorySheet` | the money-in history. ONE list where there were two (payments and debt payments). Reached from the quick-actions menu. |
| `CollectQuickActionSheet` | "Collect money" from anywhere: pick a customer, the waterfall does the rest. |
| `DebtsPanel` | one row per customer who owes, **sorted by how far behind they are**. |
| `DebtorDetailSheet` | two sections — **Debts** and a muted **Unpaid months** (partly-paid months only; see the DEBT-vs-OWED note above) — plus one `Collect · N` button that pours money over both, oldest first. |
| `DebtItemCard` | one bill that still owes, built as `CollectionCard`'s twin: label + balance on the first line, the **due** and **billed** dates under it, then a chip row. The **icon is red on every row** (that is what the list means), so the **kind chip** carries the tint instead — teal for both month and sale (the WORD parts them, as on `CollectionCard`), violet custom, and never emerald, which app-wide means money that arrived. The status chips are the point: a red **N days late**, an amber **`10/20 # Feature Deep-Dives

> Detailed behavior for each feature area. Read the relevant section BEFORE editing that area's code. Referenced from `CLAUDE.md`.
> The Month Grid algorithm itself stays in `CLAUDE.md` (it is the single most critical rule). This file covers everything built around it.

## Contents

- [Multi-Tenancy](#multi-tenancy)
- [Branches (multi-location)](#branches-multi-location)
- [Authentication Flow](#authentication-flow)
- [Multi-Month Plans](#multi-month-plans)
- [Multi-Currency](#multi-currency)
- [App Options (Global Config)](#app-options-global-config)
- [Tenant Settings (Per-Tenant Config)](#tenant-settings-per-tenant-config)
- [Subscription Tiers](#subscription-tiers)
- [Products & One-Off Sales](#products--one-off-sales)
  - [Services](#services)
- [Reports](#reports)
- [Expenses](#expenses)
- [WhatsApp Invoices](#whatsapp-invoices)
- [Transactions Hub](#transactions-hub)
- [The Ledger (charges + collections)](#the-ledger-charges--collections)
- [Regular Customer](#regular-customer)
- [Skipped Months](#skipped-months)
- [Multiple Plans per Customer (service lines)](#multiple-plans-per-customer-service-lines)
- [Pay Oldest Month First](#pay-oldest-month-first)
- [Payment Scenarios](#payment-scenarios)
- [Multi-Select & Bulk Actions](#multi-select--bulk-actions)
- [Audit Trail](#audit-trail)
- [Developer Tools](#developer-tools)

---

## Multi-Tenancy

- **RLS is the primary guard** — all queries automatically scoped to the caller's tenant via Supabase JWT claims.
- **App-level filtering** (`tenant_id` from `authStore`) is a secondary belt-and-suspenders guard.
- `tenant_id` is injected into the JWT by a Supabase auth hook at login. **Never derive it from client input.**
- Login email convention: `username@tenantcode.com` (synthetic, not a real email address).

---

## Branches (multi-location)

Tenants can optionally create branches/zones. A tenant with zero branches behaves exactly as before — feature is invisible.

**NULL semantics differ per table:**

| Table       | `branch_id IS NULL` means                                      |
| ----------- | -------------------------------------------------------------- |
| `users`     | Tenant-wide admin (sees all branches and unassigned records).  |
| `customers` | UNASSIGNED — visible only to tenant-wide admins.               |
| `plans`     | SHARED catalog item — visible to every branch.                 |
| `payments`  | (no `branch_id` column — inherits from customer via FK + JOIN) |

**RLS layered on tenant_id:**

- `public.current_branch_id()` reads `users.branch_id` for the calling user (SECURITY DEFINER).
- Policies admit a row when `tenant_id` matches AND either the caller is tenant-wide (`current_branch_id() IS NULL`) or the row's branch matches. Plans additionally admit `branch_id IS NULL` (shared) for everyone.
- Payments inherit via `EXISTS (SELECT 1 FROM customers c WHERE c.id = payments.customer_id AND c.branch_id = current_branch_id())`.
- Branch switching for tenant-wide admins is purely UI state in `uiPrefStore.currentBranchId` — no JWT change.

**UI:**

- [BranchSelector](../SubsTrack/src/shared/components/BranchSelector.tsx) is a chip rendered below `PageHeader` on Customers/Dashboard/Plans/Users. It self-conceals: only renders for tenant-wide admins (`user.branchId === null`) when ≥1 active branch exists.
- Options: All Branches (`null`) / each active branch / Unassigned (`BRANCH_FILTER_UNASSIGNED`).
- `useEffectiveBranchFilter()` / `resolveBranchFilter(user)` in [branchFilter.ts](../SubsTrack/src/shared/lib/branchFilter.ts) returns the active filter: branch-scoped users always get their own `branchId`; tenant-wide admins get `uiPrefStore.currentBranchId`.
- `applyBranchFilter(query, filter, column?)` mutates a supabase query builder: `null` → no-op, `BRANCH_FILTER_UNASSIGNED` → `.is(column, null)`, UUID → `.eq(column, uuid)`.

**Form behavior:**

- CustomerFormSheet: Branch picker only shown to tenant-wide admins. Branch-scoped users auto-assign their own branch. The plan dropdown filters to `branch_id IS NULL OR branch_id = selected_branch`, and the inline Plans editor's `PlanPicker` is **disabled** (greyed, with a "Select a branch first" hint) while no branch is chosen (`branchId === null`) — branch is required, so a plan can't be picked before it. `Dropdown` grew a `disabled`/`disabledHint` prop for this, threaded through `PlanPicker`.
- PlanFormSheet: Branch picker only for tenant-wide admins; nullable (= Shared, visible to every branch) — mirrors ProductFormSheet. Branch-scoped users always create branch-scoped plans (their own).
- UserFormSheet: Branch picker for tenant-wide admin. Once ≥1 branch exists, role=`user` requires a branch (enforced in `UserService.validate`). The `create-user` edge function additionally validates and forces branch_id for branch-scoped callers.

See gotchas #26–#32 for the full branch NULL-semantics + enforcement rules.

---

## Authentication Flow

```
app/index.tsx
  → authSlice.restoreSession()   (on mount)
  → if no session → redirect to (auth)/login
  → if session → redirect to (app)/(tabs)/home (admin) or (app)/(tabs)/customers (user)

LoginScreen
  → authSlice.login(username, tenantCode, password)
  → AuthService: email = `${username}@${tenantCode}.com`
  → AuthRepository.signIn(email, password)   [Supabase Auth]
  → AuthRepository.getUserProfile(userId)    [public.users]
  → AuthRepository.getTenant(tenantId)       [tenants joined with tier_plans]
  → stores AuthUser + tenantActive in authSlice
  → primePostAuth(user) — Promise.all of:
       get().currencies.fetchCurrencies()
       get().branches.fetchBranches()
       get().options.fetchOptions()         (loads global app_options — e.g. LiraRate)
       get().subscription.init(tenantId)
         → tierService.fetchTiers() (3 tier_plans rows)
         → tierService.fetchUsage() (counts customers/users/plans/branches/currencies)
         → tierService.getTenantWithTier(tenantId) — fresh tenant + joined tier
           → also writes back via authSlice.setUserTier so user.tenant.tier stays in sync

LoginScreen also exposes "Create a new organization" → signupSlice (2-step form):
  Step 1 (SignupOrganizationScreen)
    → signupSlice.validateAndCheckCode()
    → SignupService.validateOrganization() + repo.isTenantCodeAvailable()
    → on success → push /(auth)/signup-account
  Step 2 (SignupAccountScreen)
    → signupSlice.submit()
    → SignupService.createTenant() → SignupRepository.createTenant()
    → supabase.functions.invoke('create-tenant') [service-role server-side]
       atomically: tier_plans (lookup Free id) → tenants(tier_id=Free) →
       branches('Default Branch') → auth.users → public.users(role=superadmin, branch_id=null)
       cascading rollback on any step
    → auto-login via authSlice.login(...) with the just-entered credentials
    → root layout reacts to authSlice.user and routes into the app

app/(app)/_layout.tsx
  → if !user → redirect to login
  → if !tenantActive → show TenantInactiveScreen
  → otherwise → render tabs
```

**Hydration note:** `authSlice` exports an internal `primePostAuth(get, user)` helper called by `login` and `restoreSession`. It runs `get().currencies.fetchCurrencies()`, `get().branches.fetchBranches()`, `get().options.fetchOptions()`, and `get().subscription.init(tenantId)` in parallel via `Promise.all`. `subscription.init` is the **source of truth** for the active tier (see Subscription Tiers below).

See `docs/edge-functions.md` for `create-tenant` internals and gotcha #33 for the anon-path rationale.

---

## Multi-Month Plans

Plans can cover 1–12 consecutive months. When `durationMonths > 1`:

- The plan represents a **bundled price** for the entire period (not per-month).
- Multi-month plans **must have a fixed price** — `isCustomPrice` must be `false`.
- A single `Payment` record is created with `durationMonths` matching the plan. That payment covers all months in the range.

**Recording a multi-month payment (one bill, `duration_months > 1`):**

1. Builds a coverage set from existing active payments to detect conflicts.
2. If any months in the proposed range are already paid:
   - With `skipConflicts = false` → throws an error listing the conflicting months.
   - With `skipConflicts = true` → finds the first uncovered month, adjusts `effectiveStart` and `effectiveDuration`, records a single payment for the remaining range.
3. Returns `{ payment, skippedMonths }` so the UI can surface conflict info.

**Return types:**

```typescript
type MultiMonthConflict = { billingMonth: string; label: string };
type CreateMultiMonthPaymentResult = {
  payment: Payment;
  skippedMonths: MultiMonthConflict[];
};
```

See gotchas #13, #14, #15 for the storage + grid-rendering details.

---

## Multi-Currency

The app supports an arbitrary list of non-USD currencies per tenant. USD is the implicit base — never stored in the `currencies` table.

**Storage model: amount is as-typed, paired with `currency_id`.**

- `plans.price` + `plans.currency_id` — the price was literally `89000` in LBP (not 1.00 USD). Plan USD equivalents use the **live** rate (forward-looking pricing).
- `charges.amount` (what he was BILLED) and `collections.amount` (what he HANDED OVER), each with its own `currency_id` + `rate_per_usd_snapshot`. The customer literally handed over `89000 LBP`. **The LBP value is preserved forever**, and the USD equivalent is frozen at each row's own recording time. The two rates are deliberately separate: a debt total converts at the rate he was billed at, revenue and the wallet at the rate the cash arrived at. `BillSheet`, the year totals and every dashboard aggregate convert via the snapshot — they do not drift when the live rate is edited.
- `null currency_id` means USD throughout the codebase; USD payments store snapshot = 1.

**Conversion helpers** ([src/core/utils/currency.ts](../SubsTrack/src/core/utils/currency.ts)):

```ts
toUsd(amount, source: Currency | null): number       // null source → amount unchanged
fromUsd(amountUsd, target: Currency | null): number  // null target → amount unchanged
convert(amount, source, target): number              // go via USD
formatMoney(amount, source, target): string  // convert + Intl.NumberFormat
findCurrency(currencies, id | null): Currency | null
paymentSnapshotCurrency(payment, currencies): Currency | null  // returns the source Currency with ratePerUsd overridden by the payment's snapshot — use everywhere a historical payment amount is displayed
```

**`CurrencyInput`** ([src/shared/components/CurrencyInput.tsx](../SubsTrack/src/shared/components/CurrencyInput.tsx)) — the reusable input with an embedded currency dropdown. Used in PlanFormSheet (price) and CollectSheet (the amount received). The dropdown lists USD + active tenant currencies. Switching currency does NOT convert the typed number — switching means "I meant this number in the new currency."

**Display currency is per-TENANT, not per device** — stored in `tenant_settings` under the `DisplayCurrencyId` key (a `currencies.id`; blank/unset = USD), set by an admin in Tenant Settings and read everywhere through the `useDisplayCurrencyId()` hook. Every user of the organization therefore sees amounts in the same currency, on every device, and an admin's change reaches the others on their next sync/login. All read-only displays (PlanCard, DashboardScreen, admin/index revenue card, CustomerPaymentPanel year summary) convert their values to it at render. The currency a value was **stored in** is preserved in `BillSheet`'s primary line for receipt fidelity, with the display-currency equivalent as a secondary "≈" line. A soft-deleted / unknown id resolves to `null` via `findCurrency`, so the UI falls back to USD instead of crashing.

**Aggregates** (Dashboard) sum across mixed currencies by converting each row to USD using its `rate_per_usd_snapshot` (drift-free historical totals) in `DashboardService.getMetrics()`. The screen then formats the USD total in the tenant's display currency.

**Last-used currency** persists in [src/shared/lib/uiPrefStore.ts](../SubsTrack/src/shared/lib/uiPrefStore.ts) so the `CurrencyInput` dropdown defaults to whatever the user typed in last time.

**Currency deletion** is safety-guarded: `CurrencyService.deleteCurrency()` counts references in `plans` + `payments`. If non-zero, it does a soft-delete (sets `active = false`); otherwise it hard-deletes. `ON DELETE RESTRICT` on the FKs prevents any chance of orphaning historical data.

**Default Lebanese Pound currency.** Every newly created tenant is auto-seeded with an `LBP` (Lebanese Pound) currency (`decimals = 0`, `symbol = 'ل.ل'`). Its `rate_per_usd` is copied **once, at creation time**, from the global `app_options.LiraRate` option (see App Options below). After creation it is an ordinary editable tenant currency — the seed is a starting default, not a live link. Both tenant-creation paths seed it: SuperAdmin's `TenantService.createTenant` (via `TenantRepository.getLiraRate` + `createLbpCurrency`) and the public `create-tenant` edge function. A missing/invalid `LiraRate` never blocks signup — both paths fall back to `DEFAULT_LIRA_RATE = 89000`.

See gotchas #18, #19, #21, #22, #24, #36 for the snapshot/conversion rules.

---

## App Options (Global Config)

`app_options` is a **global, app-wide** key/value table (NOT tenant-scoped — no `tenant_id`). Columns: `id`, `key` (unique), `value` (text), `description`, timestamps. It holds cross-tenant configuration the SaaS owner controls. Seeded keys today:

- `LiraRate` — default USD→LBP rate (LBP per 1 USD) used when seeding each new tenant's LBP currency.
- `AllowPlanUpgrade` (`'true'`/`'false'`, default true) — when `false`, the in-app upgrade buttons (`TierCard`, `UpgradePromptModal`) are replaced by a "contact to upgrade" WhatsApp button that deep-links to `SupportWhatsAppNumber` with a pre-filled message. Purely a UX gate.
- `AllowSelfServiceSignup` (`'true'`/`'false'`, default true) — when `false`, the login screen hides the "Create organization" button **and** the `create-tenant` edge function rejects signups (`403`, `code: signup_disabled`) — server-side is authoritative.
- `SupportWhatsAppNumber` — support WhatsApp number (international format, digits only) used by the upgrade WhatsApp deep-link.

- **RLS:** `app_options_select` grants `SELECT` to **`anon` + `authenticated`** (anon is required because some flags gate pre-auth UI, e.g. self-service signup on the login screen). There is **no** write policy, so only the **service role** (SuperAdmin app + the `create-tenant` edge function) can insert/update/delete — RLS bypass is the write path.
- **SuperAdmin** owns full CRUD via the **Options** tab ([app/(tabs)/options.tsx](<../SuperAdmin/app/(tabs)/options.tsx>) → `OptionsScreen`). The `options` module mirrors `tier-plans` (repository + service + standalone `optionStore` + screen + `OptionFormSheet`) but adds create + delete. The option **key is immutable after creation** (only `value` + `description` are editable), so well-known keys can't be renamed out from under the code that reads them.
- **SubsTrack** has a **read-only** `options` module (repository `findAll`/`findByKey` + `OptionService.getOptions`/`getOptionValue` + `optionSlice` + `useOptionSlice`). It never writes. Options are fetched **at app bootstrap** (`app/_layout.tsx`, so the pre-auth login screen can read flags) and re-primed on login/restore via `primePostAuth`; they are intentionally **not** reset on `logout`. Reference keys through `OPTION_KEYS`, never magic strings. Read values through the typed selector hooks in [useOptionSlice.ts](../SubsTrack/src/state/hooks/useOptionSlice.ts): generic `useOptionValue(key)` / `useBooleanOption(key, fallback)`, and semantic `useCanUpgradePlan()` / `useSelfServiceSignupEnabled()` / `useSupportWhatsAppNumber()`. For **conditional UI**, prefer the declarative gate components in [FeatureGate.tsx](../SubsTrack/src/shared/components/FeatureGate.tsx) — `<CanUpgrade fallback={…}>` and `<CanCreateOrganization>` — which wrap the gated element and render `children` when enabled, else `fallback`; this keeps flag ternaries out of the screens. WhatsApp deep-links go through `openWhatsApp()` in [shared/lib/whatsapp.ts](../SubsTrack/src/shared/lib/whatsapp.ts).

See gotcha #38.

---

## Tenant Settings (Per-Tenant Config)

`tenant_settings` is the **tenant-scoped twin** of `app_options`: same key/value shape, but every row carries a `tenant_id`, and it is written **in-app by admins** rather than by the SaaS owner. Columns: `id`, `tenant_id`, `key`, `value`, timestamps, with `UNIQUE(tenant_id, key)`.

- **RLS:** `tenant_settings_select` lets **every member** of the tenant read (the values drive shared behavior, so a non-admin collector must see them too); `tenant_settings_write` restricts `ALL` to `admin` / `superadmin` of that tenant. Both scope on `current_tenant_id()`.
- **Module:** `src/modules/admin/tenant-settings/` — the usual repository (platform switch) + service + mapper + `TENANT_SETTING_KEYS`. `TenantSettingService` owns the **parsing** of raw strings into typed settings (`parseUnpaidStartRule`), so no caller ever inspects a raw value.
- **State:** the `tenantSettings` slice (loaded in `primePostAuth`, **reset on logout** — unlike the global `options` slice, since it is tenant-scoped and must not leak to the next tenant on a shared device). Read through [useTenantSettingSlice.ts](../SubsTrack/src/state/hooks/useTenantSettingSlice.ts): generic `useTenantSettingValue(key)` and semantic `useUnpaidStartRule()`. Reference keys through `TENANT_SETTING_KEYS`, never magic strings.
- **UI:** Admin → Tenant Settings, one section per setting (`UnpaidRuleSection`), matching `DisplayCurrencySection`'s card layout. Saving refreshes the current-month badge sets, since a rule change restates which months are unpaid.
- **Offline:** a normal tenant-scoped synced table. The offline write derives a **deterministic id from `(tenant_id, key)`** and upserts on that natural key (registered in `NATURAL_KEYS` **and** in `sync/push.ts`'s `conflictTarget`), so two devices setting the same option offline converge on one row instead of stalling the push on the UNIQUE index.

**Keys today:**

- `UnpaidStartRule` (`'month_start'` default \| `'customer_start_day'`) — when a month turns unpaid, and when the customer starts reading "Overdue". Those are **two** facts under `'customer_start_day'`: the **current** month is grey until the line's billing day (`isNotDueYet`), and **last** month is red but not yet *late* until that same day (`isNotLateYet`) — see gotcha #83. See [CLAUDE.md](../CLAUDE.md) → Critical Business Logic: Month Grid for the full rule; both helpers live in `customer-payments/utils/monthDueRules.ts`, shared by the grid and the customer-list aggregator.

**Adding a new key:** add it to `TENANT_SETTING_KEYS`, give `TenantSettingService` a typed setter + parser, add a semantic hook, and render a section on the screen. No schema change is needed — it is a key/value table.

---

## Subscription Tiers

Every tenant lives on one of three global `tier_plans` rows: **Free**, **Pro**, **Business**. The catalog is small and fixed (3 rows seeded by `script.sql`, editable by the SaaS owner via SuperAdmin's tier-plans module). Each tier defines numeric limits (`max_customers`, `max_users`, `max_plans`, `max_branches`, `max_currencies` — NULL means unlimited), feature flags (`multi_currency_enabled`, `multi_month_plans_enabled`), and a USD monthly price.

**Enforcement is service-layer.** Every feature `Service.createX()` calls `tierService.assertCanCreate(tier, usage, resource)` immediately after its existing `validate()`. Failures throw a typed `TierLimitError` (from [TierService.ts](../SubsTrack/src/modules/subscription/services/TierService.ts)) carrying `{resource, limit, tierCode}`. Slice actions catch via `instanceof` and set a structured `tierLimitError` field next to the standard `error: string`. Form sheets check `tierLimitError` and render an `UpgradePromptModal` (the existing `ErrorBanner` path stays for regular validation errors). This avoids parsing error strings.

**Tier and usage are passed in as parameters from components**, not read across slices in actions (slice actions still touch `get().subscription.refreshUsage()` after creates, but the _input_ tier/usage comes from the caller). The pattern in slices:

```ts
createCustomer: async (data, tenantId, tier, usage) => {
  set((s) => {
    s.customers.loading = true;
    s.customers.error = null;
    s.customers.tierLimitError = null;
  });
  try {
    const customer = await customerService.createCustomer(
      data,
      tenantId,
      tier,
      usage,
    );
    set((s) => {
      s.customers.items.unshift(customer);
      s.customers.loading = false;
    });
    void get().subscription.refreshUsage(); // ← cross-slice via get()
  } catch (e) {
    if (e instanceof TierLimitError) {
      set((s) => {
        s.customers.tierLimitError = {
          resource: e.resource,
          limit: e.limit,
          tierCode: e.tierCode,
        };
        s.customers.loading = false;
      });
    } else {
      set((s) => {
        s.customers.error = (e as Error).message;
        s.customers.loading = false;
      });
    }
  }
};
```

Components read `currentTier` and `usage` from `useSubscriptionSlice` and forward them into the action.

**Hydration:** `authSlice` exports an internal `primePostAuth(get, user)` helper called by `login` and `restoreSession`. It runs `get().currencies.fetchCurrencies()`, `get().branches.fetchBranches()`, `get().options.fetchOptions()`, and `get().subscription.init(tenantId)` in parallel via `Promise.all`. `subscription.init` is the **source of truth** for the active tier: it concurrently fetches the tier catalog, the tenant's usage, and the tenant row with its joined tier (`tierService.getTenantWithTier`), then writes the resolved tier back to `auth.user.tenant.tier` via `authSlice.setUserTier` so the auth slice stays in sync. This is why a tier upgrade made in a previous session is reflected immediately on app restart — the subscription slice never trusts a parameter-passed tier; it always re-queries the DB.

**Upgrade UX:** dedicated screen at [SubscriptionScreen.tsx](../SubsTrack/src/modules/subscription/screens/SubscriptionScreen.tsx) (routed at `/(app)/(tabs)/admin/subscription`). Shows 3 stacked TierCards with usage bars for the current tier and Upgrade/Downgrade buttons for the others. Upgrades are instant swaps via `subscriptionSlice.upgrade(tenantId, tierId)` — no billing wired up yet. Downgrades call `TierService.canDowngradeTo(targetTier, usage)` first; if usage exceeds the target tier's limits the dialog lists blockers ("42 / 30 customers") and refuses to swap. The `UpgradePromptModal` is also triggered inline whenever a form sheet hits a `TierLimitError`. The "Subscription" entry in the admin menu ([admin/index.tsx](<../SubsTrack/app/(app)/(tabs)/admin/index.tsx>)) is rendered only for tenant-wide admins (`user.branchId === null`) — branch-scoped admins don't see it.

**`UpgradePromptModal` design:** for tenant-wide admins, the modal renders compact preview cards for the available upgrade tiers (every tier with `sortOrder > currentTier.sortOrder`), each showing name, monthly price, and a few key perks (customer/user caps, multi-month/multi-currency flags). The footer has "Not now" + "View plans"; "View plans" pushes `/(app)/(tabs)/admin/subscription`. Branch-scoped admins and staff see a stripped-down "Limit reached — contact your administrator" notice with just a Close button (they can't change the tier themselves).

**Soft UX gates** beyond the hard service-layer block: PlanFormSheet hides multi-month duration UI when `tier.multiMonthPlansEnabled === false`; CurrencyFormSheet hides itself behind the same `assertMultiCurrency` check; the Add buttons on list screens stay enabled so the user always reaches an explanation.

**Tenant creation defaults to Free.** Both the public `create-tenant` edge function and SuperAdmin's `TenantService.createTenant` look up the Free tier id and stamp it on the new `tenants` row. SuperAdmin's `TenantFormSheet` exposes a tier dropdown so the SaaS owner can onboard paid tenants directly or change a tenant's tier later (the manual paid-upgrade path). `tier_upgraded_at` is touched on every change.

**Future-proofing:** to add Stripe, append nullable `stripe_price_id_monthly` / `stripe_price_id_yearly` to `tier_plans` and `stripe_customer_id` / `stripe_subscription_id` to `tenants`. Only `subscriptionSlice.upgrade()` changes — it redirects to a Checkout session, the webhook updates `tier_id`. Every other call site already reads from `currentTier`.

---

## Products & One-Off Sales

`products` + `services` + `sales` extend SubsTrack beyond recurring subscriptions. `payments` (subscriptions) and `sales` are deliberately separate ledgers — they don't share schema or service code. Subscription month-grid logic is untouched.

**Products** mirror `plans` exactly: per-tenant catalog, optional currency, `branch_id IS NULL` = SHARED, soft-delete via `active = false` when a product has historical sales (hard-delete otherwise — mirrors `CurrencyService.deleteCurrency`). Tier-gated through `tier_plans.max_products` (Free: 5, Pro/Business: unlimited). Soft-vs-hard delete keys off **`sale_items.product_id`** references (not `sales`).

**A sale is a header + lines, and a line sells a product OR a service.** One sale can hold **several lines** in any mix (a small "cart") — products only, services only, or both, but at least one of something. The account/transaction lives on the `sales` header; each thing sold is a `sale_items` row. This mirrors the `customers` → `customer_plans` header/line split. See **Services** below for what a service line is and is not.

- **`sales` (header)** — one transaction: `items_summary`, `total_amount`, `currency_id` + `rate_per_usd_snapshot`, `customer_id`, `recorded_by_user_id`, `sold_at`, void fields. It holds **no money and no custody**: what the sale OWES is its `charges` row (`kind = 'sale'`, written in the same transaction) and what was COLLECTED is a `collections` row — which is what lets one sale take installments. `Sale.amountPaid` still exists in the domain type but is **derived**, filled by `SaleService.withMoney` from the bill's balance.
  - `items_summary` — a **frozen** human summary of every line (e.g. `"Water ×2, Installation"`), built by the service at create time. It powers the Sales-tab **search** and the **list / debt / wallet labels** so those stay lean (no `sale_items` join needed). Contains every line's name — products and services alike — so search matches any of them.
  - `total_amount` — the summed line totals, **app-written** at create (a generated column can't sum a child table). Snapshot, never recomputed. It is also the amount of the sale's bill, so anything still owed on it is one "sale" debt for the whole sale.
  - `rate_per_usd_snapshot` — currency rate at sale time, same drift-free principle as `payments.rate_per_usd_snapshot`. Use `paymentSnapshotCurrency(sale, currencies)` to display — it works for any row with `currencyId` + `ratePerUsdSnapshot` despite the name.
  - `customer_id` is **nullable** — walk-in sales are recorded with `customer_id = NULL`.
  - `voided_at` / `voided_by` / `void_reason` for soft-void. Voiding cascades to `sale_items` only on hard delete (FK `ON DELETE CASCADE`); a void just stamps the header. No hard delete of active sales.
- **`sale_items` (lines)** — one row per thing sold: `sale_id`, `line_type` (`'product'` | `'service'`), nullable `product_id` / `service_id`, `item_name_snapshot` (frozen), `quantity` (**always 1 on a service line** — labour has nothing to count; see Services below), `unit_amount` (frozen, in the sale currency), `voided_at` (set only when an **edit** dropped the line — see below). `line_total = unit_amount * quantity` is **derived in the mapper** (no stored column). No own `branch_id` — RLS inherits from the parent sale (`EXISTS`), like `payments` inherit via the customer. `ON DELETE CASCADE` from `sales`; `ON DELETE RESTRICT` on **both** `product_id` and `service_id` (a referenced catalog row can't be hard-deleted — including by a line an edit dropped, which is why both reference counts deliberately count voided lines too). `chk_sale_items_line_ref` keeps the type and the ids agreeing: a `'product'` line has a product and no service; a `'service'` line has no product, and **may** have no service either — that gap is the one-off typed job.
  - The name column was `product_name_snapshot` before a line could be a service. The rename is guarded inside `script.sql` and needs a matching local backfill, because the SQLite mirror is additive-only — see gotcha #99 before renaming anything else it mirrors.

**One currency per sale, auto-convert.** A sale freezes exactly one currency + one rate (the debt / wallet / dashboard math depends on it). The `SaleFormSheet` has a single sale-currency selector; when a catalog item (product **or** service) is added, its price is **converted into the sale currency** at the live rate (`convert()` in `src/core/utils/currency.ts`) as the editable per-line prefill. The first catalog item picked adopts its own currency as the sale default (until the user changes it); changing the sale currency re-prices every catalog line from its own price — a **one-off** service has no catalog price, so its typed amount is left alone. The `SaleItemsEditor` (`src/modules/transaction/sales/components/`) owns the cart rows + sale currency and reports a `SaleCartDraft` (`lines` / `total` / `currency` / `ready` / `dirty`) up to the form — mirroring `CustomerPlansEditor`'s add/remove-row pattern. An optional `initial` seeds it from a saved sale (edit mode). It answers `dirty` **itself** rather than letting the form diff its values: it re-reports the draft from an effect one render after mount, so `useDirtyForm`'s baseline would be the empty cart and an untouched edit form would prompt "discard changes?" on close (gotcha #55). The editor owns the baseline, so it owns the answer — and its signature covers `lineType` / `serviceId` / the typed name too, or flipping a row to a service would read as untouched.

**Create is header-then-lines.** `SaleService.createSale` computes the summed `total_amount` + `items_summary`, then `SaleRepository.create` inserts the header, then the lines (web: sequential insert like the customer + `customer_plans` path; offline: header + all lines in one SQLite transaction, pushed parents-before-children via `PUSH_WAVES`). List/detail reads join `sale_items(*, products(*), services(*))` — both LEFT joins, since a line fills at most one of them; the lean aggregate/label reads (`partialSales`, `heldForWallet`, dashboard totals) read only header columns.

### Services

A **service** is labour the tenant charges for — an installation, a repair visit, a router setup. Before this existed the only way to bill for one was to invent a fake product, which dragged it through the stock ledger and the derived stock expenses where it does not belong.

**What a service is:** a **line on a sale**. There is no service record, no Services tab, and no fourth money stream. That is the design, not a shortcut: every money figure in the app reads the sale's **one bill**, so services arrived in revenue, debts, the collector wallet, Reports, WhatsApp invoices and the CSV export with **no new aggregation anywhere**. Read gotcha #98 before adding a "services revenue" figure — a mixed sale raises one charge, and splitting the cash against it between goods and labour is a number the business never agreed to.

**What a service is NOT:** stocked or costed. No `stock_movements` row, no oversell check, no expense. Staff pay is still typed by hand under the `salaries` expense category. Because a service line moves no stock, every stock path narrows through `productLines()` / `savedProductLines()` in `sales/utils/saleLines.ts` — never a nullable-id test (gotcha #97).

**The price list (`services`).** Admin → Services, reached from the admin menu. The products screen minus stock and cost: name, description, price + currency, branch (`branch_id IS NULL` = SHARED), `active`. `UNIQUE(tenant_id, branch_id, name)` and the RLS pair `services_select` / `services_modify` are copied from `products` verbatim — so a **collector** can add one from the sale form the same way they can add a product, and a branch-scoped user can only write in their own branch. **No tier limit** (unlike `max_products`): services are uncapped. Soft-delete when any sale line references it (counting voided lines, since the FK is `ON DELETE RESTRICT`), hard-delete otherwise — the same two-mode `deleteService` as products, with a batch counterpart. Audited like products, with **History** on the card menu via `useRecordHistoryAction('services')`.

Layers: `src/modules/admin/service-catalog/` — repository (+ `.offline`, platform switch), `ServiceCatalogService`, `ServiceListScreen`, `ServiceCard`, `ServiceFormSheet`, and a `services` slice with the standard `loaded` guard. The business-logic class is named `ServiceCatalogService`, not `ServiceService`, because "service" is also this app's name for that whole layer — and the module folder is `service-catalog` so the file is not `admin/services/services/…`.

**Picking one on a sale.** A line's kind is decided by **which button added it** — the cart footer holds two dashed buttons, **+ Add product** and **+ Add service** — and the card then only *labels* what it sells (icon + word, plus `#n` when there are several). There is **no per-row switch**: the first shape of this editor put a full-width `Product | Service` segmented control at the top of each card, which read as a page tab bar, so tapping "Service" looked like navigating to a services list and instead silently wiped the product the user had just picked (gotcha #101). A sale holding both is therefore **two lines, never one line toggled twice**, which is also what the data model always said. A new sale opens with **zero** rows — the two buttons are the empty state — and any row, including the last, can be removed, which is how a line's kind is changed. In a service row the dropdown offers the active catalog services (priced in the sale currency, same conversion as products) plus a final **"Other — type a name"** option, which reveals a name field: that is the **one-off** — `service_id IS NULL`, and `item_name_snapshot` is the entire record of what was sold, so no catalog row is created. Adding a service inline (the dropdown's "+") prices the row from the object the form just saved, not from a store lookup, which would miss it on that render.

**A service line has NO quantity — only a price.** No stock cap, no "N left" caption, and **no stepper at all**: labour is one job at one price, so the row shows a single **Price** field which *is* the line total. Two jobs are two lines; a bigger job is a bigger number. This is enforced by the type, not by a runtime check — the `service` variant of `CreateSaleItemInput` simply has no `quantity` field, so the compiler stops any caller from multiplying one. `lineQuantity()` (`sales/utils/saleLines.ts`) is the one answer to "how many?", returning 1 for labour, and every total, summary and DB row goes through it: `sale_items.quantity` still exists and still stores **1** on a service line, so nothing downstream had to learn a special case. The receipt and the WhatsApp invoice both drop the `1 × …` prefix on a service line, because "1 × $25 = $25" is noise.

**Validation** splits by kind in `SaleService.validate`: a product line needs a real catalog row (`errors.sale_product_required`) **and** a positive integer quantity, a service line needs a non-blank resolved name (`errors.sale_service_required`) — which is also what keeps the `NOT NULL` name column legal for a one-off — and no quantity rule at all. The positive `unit_amount` check is shared.

**Edit an existing sale.** A recorded sale can be corrected in place — "I rang up the wrong product / quantity / price" no longer means void + re-record, which lost the receipt id and left a dead row in the trail. **Any staff member** may edit, from the sale row's **3-dot menu** or the receipt sheet's **Edit sale** action (all three sale surfaces: the Sales tab, the customer panel, the per-customer page). It reuses **one form** — `SaleFormSheet` takes an optional `sale` prop and switches title, button and submit path; there is no second edit form. A **voided** sale is a closed record and never offers the action (`SaleService.updateSale` refuses it, and both repositories filter `voided_at IS NULL`).

Everything the form owns can change: the lines (including swapping a product line for a service one, or the reverse), quantities, unit prices, the sale currency, the customer, the amount collected and the notes. What identifies the sale cannot: `id`, `tenant_id`, `sold_at`, and the original `recorded_by_user_id` (who made the correction is in the audit trail, not on the row). Five rules make it safe:

- **Changing the currency RE-FREEZES `rate_per_usd_snapshot`**, exactly like editing a payment (gotcha #21) — the corrected row is what every historical USD total then reports.
- **The stock ledger is swapped, not reversed.** `SaleRepository.update` soft-voids the sale's live `'sale'` movements and inserts fresh ones — the same idempotent shape as `voidSale`, never compensating opposite rows (gotcha #48). It only happens when the **per-product** unit count actually changed: `SaleService.sameStockFootprint` compares the carts by product, so a price / notes / amount-paid fix leaves the ledger untouched (and splitting one line of 3 into 1 + 2 moves nothing, so it doesn't either). **Service lines are invisible to that comparison on both sides**, so a service-only edit compares two empty footprints and correctly leaves the ledger alone; replacing the last product line with a service yields an empty replacement set, which voids the old movements and inserts none — giving the stock back exactly once (gotcha #97).
- **The sale's own units count as available while it is being re-cut.** `assertStockAvailable` takes a `credited` map (and `SaleItemsEditor` a matching stock credit), so re-pricing a sale that took the last unit isn't rejected as out of stock, and the cart's "N left" caption shows the true ceiling. The editor also keeps a product that was **deactivated** since the sale on its line — otherwise the edit couldn't re-save the line it is standing on — while barring it from a new one.
- **A dropped line is soft-voided (`voided_at`), never deleted.** The sync engine has no tombstones for `sale_items`, so a delete would live on forever in every other device's mirror. Lines are matched to the existing rows **by position**, so a line that merely changed quantity or price keeps its id and syncs as a plain update. `mapDbSaleToSale` filters voided lines out — the one place both the web and the offline read pass through — and the Sales-tab product filter skips them too.
- **A walk-in edit keeps the sale's branch.** The create rule (`customer.branchId ?? user.branchId`) would move a collector's branch sale to "no branch" the moment a tenant-wide admin corrected a typo in it, so an edit falls back to `sale.branchId` instead.

An edit **re-prices the bill and leaves every payment against it alone** — money is a `collections` row with its own date, collector and custody, so correcting it means voiding that payment, not re-typing a number here. The form shows the collected amount read-only and refuses a total below it (`errors.sale_total_below_collected`); the service refuses it too. There is **no custody lock** — a sale stays editable after its cash has been handed up the chain. One audit entry is written for the sale as a whole (`action: 'update'`, changed columns only) — `sale_items` and `stock_movements` remain deliberately un-audited, and the changed `items_summary` / `total_amount` are what report a re-cut cart.

**Receipt (`SaleDetailSheet`).** The lines get their **own card**, separate from the customer / sold-at / receipt-ID rows: an "Items" header (cart icon + line count when >1), then one row per line — numbered bubble, `item_name_snapshot` (a **service** line prefixed with a small `construct-outline` mark, so the bill shows at a glance which part was labour), a `qty × unit price` sub-line, and the line total on the right. A totals footer (Total, plus Paid / Remaining when the sale is partial) renders only when it adds information (multi-line or partial sale). The hero's caption swaps the frozen `items_summary` for a "{{count}} items" count once there is more than one line, since the summary gets long. Lean reads (empty `items`) simply skip the card.

Below the lines the receipt shows **every payment that reached the sale** — the same `BillPaymentsList` the month bill sheet uses, fed the sale's own `chargeId` and currency snapshot. A sale and a month are one `charges` row to the ledger, so a sale paid in installments deserves the same running record: one row per hand-over with its amount *against this sale*, its date, its collector, an "also paid other bills" note when the cash was wider than this record, and a 3-dot menu offering **Send on WhatsApp** (customer + phone only) and **Void payment**. Voiding one there refreshes the screen behind, so the sale reads as owing again. A lean read carries no `chargeId`, so the block is not rendered and nothing is fetched.

**Row actions (`useSaleActions`).** Every sale row carries a **3-dot menu** holding everything one sale can do, so no action is reachable only by opening the receipt first: **View receipt · Edit sale · Complete · Send invoice on WhatsApp · History · Void sale**. A **voided** sale keeps only the two that still make sense (view + history) — void is final, so it is never editable, re-sendable or voidable again. The WhatsApp row stays **visible and disabled with a caption** when there is nobody to send to (walk-in) or no phone on the customer, the same "explain, don't vanish" rule the invoice selection action follows.

**Collect** appears only while the sale still owes something and has a customer (a walk-in has nobody to chase). It opens the very same `CollectSheet` every other bill uses — one door for money in, so custody, the audit entry and the currency rules are written in exactly one place. The old **Complete** action is gone with the model that needed it: `amount_paid` had no date of its own, so "he really paid in full, it was written down short" could only be expressed by rewriting the number. Now the second payment is simply recorded, on the day it happened. The hook takes an `onCollected` callback carrying the created `Collection`, and the sale form's `onCreated` / `onUpdated` carry the saved `Sale` — a list that keeps its own state (the two customer-scoped ones) patches itself from the row. The Sales tab needs neither: `ledger.collect` fans the hand-over out to `sales.applyCollection`, and the slice patches its own list and month totals on every write (gotcha #116).

The whole set is defined **once**, in `sales/hooks/useSaleActions.tsx`, and used by all three sale surfaces (Sales tab, customer panel, per-customer page) — adding an action means one edit, not three. The hook owns the `ActionMenu`, the shared-reason void dialog and the record-history sheet; the screens keep the receipt sheet and the sale form, since those carry each screen's own refresh callback. Two deliberate choices inside it:

- **One menu per SCREEN, not per card.** The debts / expenses cards each mount their own `ActionMenu`, but the sales lists are paginated and virtualized, so a per-card menu would mount a bottom sheet per visible row. `SaleCard` only raises `onMenu(sale)`.
- **One void dialog for one sale and for a selection.** `requestVoid(sales)` feeds the same `SaleBulkVoidSheet` from the card menu and from the multi-select toolbar, so a single-sale void gets the same reason box and the same `voidSales` path (its title/message have `_one` plural forms so the copy reads right for one row).

**Branch semantics:**

- `products.branch_id`: same as `plans` — `NULL` = SHARED catalog item visible to every branch.
- `sales.branch_id`: same as `customers` — `NULL` only when a tenant-wide admin records a walk-in without picking a branch. RLS scopes branch-scoped users to their own branch. `sale_items` has no `branch_id` — it inherits via the parent sale.

**`AsyncEntityPicker`** ([src/shared/components/AsyncEntityPicker.tsx](../SubsTrack/src/shared/components/AsyncEntityPicker.tsx)) is the reusable customer picker built for `SaleFormSheet`. Generic over `<T>`; the caller passes a `loadPage(search, page)` callback. Reuses `SearchTextBox`, `useDebounce` (300 ms), and a `requestToken` ref to discard stale responses when the user types fast (same pattern as `customerSlice.searchToken`). Use it any time the option list is too large to fit in memory — small static lists keep using `Dropdown`.

**Sales tab filters:** `SalesPanel` exposes a chip filter bar above the list — search (sale `items_summary` + customer name), customer (`CustomerPicker`), product (`Dropdown` over active products, lazy-loaded via `fetchProducts` on mount — the repo resolves "sales containing this product" from `sale_items`), and a **From/To date range** (`DatePickerInput` with `triggerStyle="chip"`, the two pickers constrain each other via `minDate`/`maxDate`). All non-search filters live on the `sales` slice (`customerFilter`, `productFilter`, `fromDate`, `toDate`) and flow into `saleService.getSales` → `SaleRepository.findAll`; date bounds are calendar days converted to `sold_at` timestamp bounds (end inclusive via next-day-exclusive). A "Clear filters" chip (visible only when ≥1 filter is active) resets them in one tap via `clearFilters`.

**Customer sales surfaces:** the customer detail screen renders `CustomerSalesPanel` at the **bottom** (below the payment grid + details card). The panel shows only a **5-sale preview**; when the customer has more it renders a "Show all" link to a dedicated full-page list (`CustomerSalesListScreen` at `customers/[id]/sales`) that mirrors the Sales tab (search + infinite scroll + record FAB + void) but is locked to one customer. Both surfaces keep their **list reads** independent of the global `sales` slice — the panel via `saleService.getSalesForCustomer` (with a stale-response token guard), the full page via the `useCustomerSalesList` hook — so neither clobbers the Sales tab's filter/search/list state. **Mutations, however, route through the global slice** so the Sales tab cache stays coherent: creates go through `SaleFormSheet` → `saleSlice.createSale` (unshift), and voids go through `saleSlice.voidSale` (drops the row from `sales.items`); each surface then refreshes its own local list. Neither surface applies a branch filter: they show **all** of the customer's sales regardless of the admin's current branch view.

Both customer surfaces also carry **multi-select → one WhatsApp receipt** (`useSaleInvoiceAction`): long-press a card to enter selection, tap to tick, and the send action builds a single receipt for the whole selection. The full page uses the page-header `SelectionBar` (with select-all); the **preview panel** swaps its own title row for an `InlineSelectionToolbar` with **no select-all** — five rows don't need one — inside a fixed-height (`h-9`) wrapper so entering selection can't shift the cards under the finger that long-pressed one, and it hides "Show all" while selecting. Its selection is cleared by every `refresh()`, because a new sale can push a ticked row out of the 5-row preview. Bulk **void** stays on the full page and the Sales tab only.

**Dashboard:** `DashboardService.getMetrics()` makes **one** cash read — `collectionService.collectedInRange` — plus a plain `saleService.countInRange` for the activity count. The Revenue card shows `monthlyRevenue = subscriptionRevenue + salesRevenue + manualRevenue`, with a breakdown sub-line listing only the non-zero streams. All three come from the SAME rows, split by what each one settled (`charges.kind`), so unlike the old three-query version **they add up to the total exactly**. Everything is summed in USD via each row's frozen `rate_per_usd_snapshot`, then formatted into the display currency at render.

**Revenue is CASH COLLECTED, not billed value** — and now there is only one place it can come from: `collection_items`, by `collections.received_at`. A partial payment contributes only what arrived; the remainder is a debt and enters revenue in the month it is collected, so every unit of money is counted exactly once and nothing collected is lost. Reading from the **item** side is what fixed the old breakdown: a payment against a sale debt used to land in a "debts" bucket, so sales revenue under-reported. `salesCount` is still every sale row, paid or not (`SaleRepository.countInRange`) — only the money is cash-based. Do **not** switch any revenue query back to `sales.total_amount` or `charges.amount`.

**Home analytics (expanded).** `getMetrics()` also computes a richer analytics set, all branch-scoped and USD-canonical:

- **Month-over-month** — `prevMonthRevenue`, the dashboard's only comparison figure (there is **no revenue chart**: it was removed along with `RevenuePoint`, `getRevenueTrend` and the slice's `trend` state). The hero card renders a ▲/▼ % pill ("vs last month") when the prior month had revenue. Built by `DashboardService.getMonthCollections(year, month, branchFilter)` — one private helper that returns a month's collected cash split by what it settled (plus `paymentsCollectedCount` / `salesCount`), and the **only** place the revenue query is issued: `getMetrics()` calls it twice inside its own `Promise.all` (this month for the breakdown, `month - 1` for the pill), so both figures come from the **same read**, scoped by **when the money arrived** (`collections.received_at`, never `billing_month`) — the pill compares like with like by construction, not by two code paths agreeing. `Date` normalizes month 0 into last December, so January needs no special case.
- **Growth this month** — `newCustomersThisMonth` / `cancelledThisMonth` via `customer.countCreatedInRange` / `countCancelledInRange` (by `created_at` / `cancelled_at`, `[monthStart, monthEndExclusive)`).
- **Activity this month** — `paymentsCollectedCount` (positive-amount rows in `paidAmountsForMonth`, scoped by `paid_at`) and `salesCount` (`totalsForMonth` row count). The screen derives **avg payment** = `subscriptionRevenue / paymentsCollectedCount`, shown as the "Payments" tile sub-line.
- **Total debt tile** — the one figure on the dashboard that is **all-time, not month-scoped** (it answers "how much is still outside", which has no month). `totalDebt` comes straight from `ledgerService.getDebtsView().summary.totalUsd` — the same number as the Debts screen header. Its sub-line breaks it down by kind (`monthsDebt` / `salesDebt` / `manualDebt`), and **these now sum to the headline exactly**: every row carries its own balance, so there is no gross-vs-net split left to explain. The old mismatch (and the reverted attempt to reconcile it) died with `debt_payments`.
  - `totalDebt` **also appears inside the purple hero card** as a red-tinted chip (`bg-red-400/20`, matching the card's decline pill) prefixed with a minus — `Owed by customers −$383.00` — shown only when `totalDebt > 0`. It sits below the revenue breakdown, sharing a wrapping row with the orange `Expenses $X` chip. **Only the red chip carries a minus** — spending prints unsigned, the same way `outflowLabel()` prints it on the Expenses tab, so the two screens never disagree about the sign of a cost. The tint + minus are load-bearing: everything else in that card is money **collected**, so the one figure that is money **not** collected has to read as an outflow at a glance. The tile below keeps the reconciling category breakdown; the chip is the glance-value.
  - The hero's revenue breakdown lists **Subscriptions and Sales** (and hand-typed fees when there are any). The old "hide collected debts from the breakdown" rule is obsolete: money is now filed under **what it paid for**, so cash that settled a sale debt appears under Sales — where the owner would look for it — instead of in a second debt figure beside the one that says what is still owed.
  - So the card carries **money in** (big number + streams) and **money out** (the chips) together, and they never mix: collecting a debt raises the total and lowers the red chip.

**The hero card is its own component** — `dashboard/components/RevenueHeroCard.tsx`. It owns every figure printed on the purple card and derives them itself (the month label, the ▲/▼ pill, the revenue mix, the two outflow chips, the collection bar), so the screen hands it only `metrics`, `fmt`, `showExpenses` (admin **and** something was spent — the same flag that reveals the two money-out tiles below) and an `onPress`. **Tapping the card opens the Reports tab**, and a "Reports ›" pill in its top-right says so; both the dashboard and Reports are admin-only tabs, so anyone who can see the card can open it. Without `onPress` the card renders as a plain `View` — no pill, no press feedback. Layout is flat panels rather than divider rules: the revenue mix and the Net row each sit in a `bg-white/10` inset (the old `bg-indigo-500` dividers were invisible, since `bg-primary` **is** indigo-500).

Presentation: the screen uses a shared `StatTile` (label / big value / sub-line / tone / optional icon) for the stat grid (Active, Unpaid, New, Cancelled, Payments, Sales) and the total-debt money tile. Every repo range query has a Supabase + Offline SQLite implementation behind the `ICollectionRepository` / `IChargeRepository` / `ISaleRepository` / `ICustomerRepository` seam.

**Tier-gating** is sale-blind: products consume a slot (gated by `max_products`), but recording sales is unlimited on every tier. Stock is not gated at all — restocking is unlimited.

### Stock

Every product carries a stock quantity and can be **out of stock**. Stock on hand is **computed at runtime** — `Product.stockOnHand = SUM(stock_movements.quantity_delta)` over the non-voided rows — exactly like Debts and the Collector Wallet. There is deliberately **no counter column on `products`**: the offline sync pushes whole rows with latest-`updated_at`-wins, so two devices each selling one unit offline would both write the same decremented number and one sale would vanish. Additive ledger rows merge with no conflict.

**`stock_movements`** — `product_id`, signed `quantity_delta` (never 0), `reason`, `sale_id` (only for `'sale'`), `unit_cost` + `currency_id` + `rate_per_usd_snapshot` (what the stock cost to BUY — see below), `note`, `recorded_by_user_id`, `occurred_at`, plus soft-void fields. Reasons:

| Reason | Written by | Sign |
| --- | --- | --- |
| `initial` | the "Starting stock" field on **product create** | + |
| `restock` | the product's stock sheet, "Add" — or the **batch restock** sheet | + |
| `adjustment` | the product's stock sheet, "Remove" (damage, miscount, wrong entry) | − |
| `sale` | `SaleService.createSale`, one row per line | − |

**Reading it.** Web reads the `product_stock` view — `SUM(quantity_delta) … WHERE voided_at IS NULL GROUP BY product_id, tenant_id`, declared `WITH (security_invoker = true)` so the caller's RLS on `stock_movements` still applies (**requires PG 15+**; without `security_invoker` the view runs as its owner and leaks every tenant's stock). Offline runs the same `GROUP BY` on the mirror — there is no local view. Both are `IProductRepository.stockOnHand(ids?)` returning `Record<productId, number>`; products with no movements are absent and default to 0. `ProductService.getProducts` folds the map into each `Product`.

**Branch scoping is inherited from the PRODUCT, not the sale.** The `stock_movements_all` policy mirrors `products_select` (`current_branch_id() IS NULL OR p.branch_id IS NULL OR p.branch_id = current_branch_id()`) — **not** `sale_items_all`, which inherits `sales`' *owned* semantics. Copying `sale_items_all` would hide every SHARED product's movements from a branch-scoped user, so each shared product would read as permanently out of stock and be unsellable for them. A shared product has **one** stock pool across all branches. The `WITH CHECK` also allows shared products (unlike `products_modify`): a branch user who can *sell* a shared item must be able to write its movement.

**Writing it.**

- **Sale create** — `SaleService.createSale` builds one negative `'sale'` movement per line and passes them in `CreateSalePayload.movements`. The repository writes them alongside the header + lines (offline: the *same* transaction), so a sale can never exist without the stock it consumed.
- **Sale void** — the sale's movements are **soft-voided** (`UPDATE … WHERE sale_id = ? AND voided_at IS NULL`), not reversed with opposite rows. One statement, independent of line count, and idempotent — a repeat void is a no-op instead of returning the stock twice. Bulk void inherits this for free (`saleSlice.voidSales` loops `saleService.voidSale`).
- **Manual** — `ProductService.addStock` appends a single `restock` row. **A manual entry only ever ADDS** — there is no "remove from stock" form: a delivery that was mistyped, never arrived, or was logged twice is fixed on the entry that recorded it (see [Editing a stock entry](#editing-a-stock-entry) and [Reverting a stock entry](#reverting-a-stock-entry)). A row is never deleted, and a `'sale'` row is never touched by hand.
- **Batch restock** — `ProductService.restockMany(entries, tenantId, note, userId)` appends one `restock` row **per product** in a single `addMovements` call (offline: one transaction), then returns the fresh on-hand map so `productSlice.batchRestock` updates the list without a refetch. One arriving delivery = one save, but the per-product history stays exactly as detailed as the one-at-a-time path — there is no "batch" reason and no grouping row. The shared note is copied onto every row.

**Blocking.** `SaleService.createSale` calls `assertStockAvailable` after `validate()` — a **fresh** `stockOnHand` read (the store can be minutes stale), summing the requested quantity **per product across all cart lines** (the same product can sit on two rows). Throws `errors.sale_out_of_stock` / `errors.sale_insufficient_stock`. Because it lives in the service, every entry point is covered (sale form, quick actions, customer screens). `SaleItemsEditor` mirrors it as a soft guard: out-of-stock products stay listed but greyed via `DropdownOption.disabled`, the quantity stepper caps at *on-hand minus what other rows already took*, each row shows "N left", and an oversold cart reports `ready: false`. The check is **advisory** — two offline devices can still each sell the last unit, and the DB deliberately allows a negative total (gotcha #48).

**UI.** `ProductCard` shows a green "N in stock" / red "Out of stock" / red "Short by N" chip. `ProductStockSheet` (product row menu → "Adjust Stock", or the link on the edit form) shows the current on-hand, a quantity + cost + note that only ever adds, and the last 20 movements as a bordered list: a reason icon tinted by direction (green adds / red removes), the reason, date **and** time (`formatDateTime`), who recorded it (resolved from the users slice via `recordedByUserId`), the note, a **3-dot menu** on every correctable row (Edit entry · History), and a "Reversed" chip with struck-through amount on voided rows. An amber line warns when the save would push stock **below zero** — it never blocks, because the DB accepts a negative total on purpose (gotcha #48). `ProductFormSheet` takes "Starting stock" on **create only**; on edit it renders the number read-only next to an "Adjust Stock" link, so the total is never free-typed.

`ProductBatchRestockSheet` is the many-products counterpart: a search box, then every **active** product as one compact row — name, current on-hand, and a `[−] qty [+]` stepper. A row with a quantity turns indigo and previews the result (`3 → 8`), so what's included is visible without reordering the list while the user types. One shared note applies to every row, and a summary line ("N products selected · +40") sits above the save button. Quantities are held per product id, so filtering the list never loses what was already typed. Two entry points, one component: the **Restock** button beside the search box on the products screen, and **Batch Restock** in the PageHeader quick-actions menu (admin-only there, since products live in the admin tab that non-admins never see).

**Cost — the money side of the ledger.** A movement can carry what one unit cost to buy: `unit_cost` + `currency_id` + `rate_per_usd_snapshot`, written together by `ProductService.movement()` or all three null. That is the **only** money on `stock_movements`, and it is what makes buying stock an expense (see [Expenses](#expenses)). `products` also gained `cost_price` + `cost_currency_id` — a *default* that pre-fills the restock forms, live like `price` and never frozen; each delivery freezes its own cost on its own movement. Everything is optional: a restock with no cost still records the stock and simply adds no expense, which is also what every legacy row does. A `'sale'` movement never carries a cost (stock leaving is not money leaving) — `movement()` enforces that one.

**Cost is typed in three places:** the product form's **Cost price** field (the default, plus the opening stock's cost on create), the stock sheet's **Cost per unit** / **Total cost** pair (see below), and the **batch restock** sheet, where one **delivery currency** is picked for the whole save and each picked row opens a cost line seeded from its product's cost price, converted at the live rate (the `SaleItemsEditor` rule — changing the delivery currency re-prices every row). The stock history shows a costed row's money ("Cost: $X", or green "Money back: $X" on a negative row), so which rows moved Expenses is visible.

**A stock expense comes back down through the ENTRY, never through a second row.** `amount = quantity_delta × unit_cost`, so a *negative* costed row is a negative expense — a credit — but **no new one can be written**: the stock sheet has no Remove mode, so the two doors are **Edit entry** (the row says 12, the delivery was 10) and **Revert entry** (the row should never have existed). Both take the money off the **entry's own month**, which is what a mistyped delivery needs — correcting a July delivery in August drops July's expense and leaves August alone. The credit shape stays supported for the negative rows older data already holds, and for editing one of them; it is simply not something staff can create any more.

**What has no door any more:** stock that really left later — damaged, lost, stolen, or returned to the supplier. Those were the empty-cost and the costed *removal*, and both went with the Remove mode. The count now comes down only by selling, or by editing the entry that put the units there — which rewrites that entry's own month instead of recording a later event.

**Per unit or per delivery — both are typeable, and each fills the other.** A supplier invoice states one or the other ("4.50 each", "45 for the lot"), so the stock sheet puts **Cost per unit** and **Total cost** side by side: typing either one recomputes the other from the quantity (`total = unit × qty`, `unit = total ÷ qty`). Only **`unit_cost`** is ever saved — the total is a way of entering it, not a column — so the derived unit keeps **8 decimals** (what `stock_movements.unit_cost` stores): rounding 100 ÷ 3 to 33.33 would make the recorded expense 99.99 and disagree with the invoice that was typed. **The last field staff typed is the anchor**, so changing the quantity afterwards recomputes the *other* one and never overwrites what they entered — typed a 45 total, then fixed 10 units to 12, and the unit becomes 3.75 while the total stays 45. Everything else keeps the per-unit field as the source of truth: an abandoned edit and picking Edit on a row both reset the anchor to "unit". One currency for both — the picker sits on the per-unit input and the total is locked to it, since a movement stores one currency.

#### Editing a stock entry

A **manual** movement can be corrected in place — `ProductService.updateMovement` → `IProductRepository.updateMovement`, reached from the history row's 3-dot menu → **Edit entry**. It is one of the **two** doors into "the stock number is wrong"; the other is [Reverting a stock entry](#reverting-a-stock-entry):

| | **Edit the row** | **Revert the row** |
| --- | --- | --- |
| What happened | the entry was **written** wrong (12 typed for a 10-unit delivery, a cost of 0.50 the invoice says was 0.45) | the entry should **not exist** at all (logged against the wrong product, saved twice) |
| The history says | 10 arrived | the row stays, struck through and chipped "Reversed" |
| The month that moves | the entry's **own** month — July becomes $5.00 | the entry's **own** month — July's $6.00 goes away |

Both look backwards, and that is now the whole story: a manual entry cannot *remove* stock, so "12 arrived, then 2 went back" is a shape the ledger no longer writes (it did until this change — gotchas #94 / #96 keep the reasoning, and older data can still hold such a row).

**What may change, and what may not.** Only **quantity**, **cost + currency** and **note**. `occurred_at` is locked (it is what decides which month the money counts in — moving it is what the two-doors rule exists to avoid), and so are `reason`, `product_id` and the row's own identity. `UpdateStockMovementPayload` is the type that says so.

Four guards live in the **service**, so every future caller inherits them:

- a `'sale'` row is refused (`errors.stock_movement_sale_locked`) — `SaleService` swaps a sale's movements when the sale is edited, so a hand-edit would leave the sale saying 3 sold and the ledger saying 1;
- a **voided** row is refused — it is already dead;
- the quantity arrives as a **magnitude**, and the sign is taken from the existing row, so a correction can structurally never turn stock added into stock removed (that is a new event, not a fix);
- **oversell is not blocked**, only warned about in the sheet — editing a delivery of 12 down to 10 after 11 were sold lands on −1, and negative stock is legal by design (gotcha #48).

**The rate only re-freezes when the cost actually moved.** Changing the amount or the currency re-snapshots `rate_per_usd_snapshot` at the live rate (the payment/sale edit rule, gotchas #21 / #90); editing only the quantity keeps the old rate, or a 2-unit fix would silently re-value a months-old purchase at today's rate. `ProductService.costFields()` is the one place that builds the cost trio, shared with `movement()`.

**Editing is why `stock_movements` is now audited** — see [Audit Trail](#audit-trail). Nothing else would remember that the row once said 12: the ledger is the only record of a manual movement, and an in-place edit overwrites it. Only an **edit** or a **revert** writes an audit entry (the insert would just duplicate the stock history), the entry is filed under the parent **product's** branch and name (`auditedUpdate`'s new `audit` option — a movement owns neither), and the same trail is readable from the row's own **History** action.

**UI.** One form does both jobs, like `SaleFormSheet`: picking Edit fills the sheet's quantity / cost / note from the row, puts an "Editing this entry" banner above it (direction locked, with a Cancel ✕ and a one-line note on when an edit is the wrong tool), and turns the button into "Save Changes". The tapped row sits far below the form, so picking Edit also **scrolls the body back to the top** (`scrollBody.current?.(0)`, the handle `FormSheet` fills through its `scrollRef` prop — a ref and not a context, see gotcha #102) — otherwise the filled fields and the banner stay off-screen and the action looks like it did nothing. Saving **keeps the sheet open** and reloads the history — a correction is only believable next to the rows it fixed — and resets the form to its first-render state so the unsaved-changes guard stays quiet.

#### Reverting a stock entry

The edit door's sibling, for when the entry should never have existed at all — a delivery logged against the wrong product, a duplicate save, an adjustment somebody typed on the wrong row. Reached from the same 3-dot menu (**Revert entry**, red, last), behind a confirm dialog, and open to **any staff member** like the edit.

**It is a soft-void, not a row deletion.** `voided_at` + `voided_by` are set, and both derived numbers fix themselves: the row leaves the stock sum (`product_stock` / the mirror's `GROUP BY` count only live rows) and, if it carried a cost, it leaves Expenses. The row stays in the history, greyed out with the "Reversed" chip that a sale-voided movement already wears — hard-deleting it would take away the only answer to "where did the other 12 bottles go", and the ledger is deliberately a record of what staff did, not just of the current total (rule 7, no hard deletes).

**The month is the entry's own, exactly like an edit.** Reverting says the entry was never real, so the money comes off the month the entry belongs to: a July delivery reverted in August leaves August untouched and drops July's expense. There used to be an opposite door — a costed *removal*, which credited the month it was recorded in — but the stock sheet's Remove mode is gone, so only older data holds such a row (see [Stock](#stock) → cost, gotchas #94 / #96).

**Refused for the same rows an edit is refused for, in the SERVICE.** `ProductService.revertMovement` and `updateMovement` share one guard — `liveManualMovement(id)` — so a `'sale'` row (its movements belong to the sale, which swaps them itself) and an already-reverted row are turned away wherever they are called from, not merely hidden in the menu. `stock_movements.voidMovement` is the one write, audited as a **`void`** with the parent product's branch and name, so "who reverted this and when" is answerable — and the reverted row's menu keeps its **History** action for exactly that (Edit and Revert are gone; a `'sale'` row still opens no menu at all).

**UI.** The confirm dialog names the entry ("Stock added +12 will stop counting…") and says what happens to the totals. On success the sheet stays open and reloads the history, so the "Reversed" row is visible immediately, and a form still filled from that row is reset — otherwise Save Changes would sit there pointing at an entry that no longer counts.

See gotchas #35, #36, #37, #48, #88, #89, #94, #96.

---

## Reports

The Home dashboard answers one question — "how is **this month** going?" — with fixed tiles for one fixed period. The Reports tab answers "how is the business going, over any period I choose". It is a small number of curated sections, not a query builder: an ISP owner reads them, not a data analyst.

**Admin-only**, the same gate as Expenses and the dashboard — the tab is hidden with `href: isAdmin ? undefined : null`, so the route is not even in the tab bar for a collector.

### The page

`PageHeader` (with the branch chip and a CSV export button) → `PeriodPicker` → a `SegmentedTabs` section switcher → the section's cards. Phase 1 ships **Money** and **Debts**; Customers and Staff/Products are phase 2 and drop into the same shells.

**Period** (`src/core/utils/dateRange.ts`) is one primitive: `ReportPeriod { preset, fromDate, toDate }` with presets *This month · Last month · Last 3 / 6 / 12 months · This year · Custom*. Every preset is **whole calendar months** — it always ends on the last day of its final month — so its buckets and its comparison window are the same shape. `previousPeriod()` shifts a month-aligned period by whole months and anything custom by its own day count. The file also holds the app's `dayStartIso` / `nextDayStartIso` / `rangeFromDays` helpers, which four repositories and the expense slice used to carry privately.

### Money

| Block | What it shows |
| --- | --- |
| KPIs | Collected · Spent · Net · Margin, each with a ▲/▼ pill vs the previous period of the same length |
| Money in | Breakdown by stream, with an inline share bar |
| Money out | Breakdown by expense category (including the derived `stock` half) |
| Collected by currency | What was **physically** collected in each currency, each printed in its own currency with a `≈` display-currency value beside it |

### Debts

| Block | What it shows |
| --- | --- |
| KPIs | Still owed (**all time**) · Collected on debts (**this period**) · Customers owing · Behind on payments (**counted to today**, so this one does not move with the period) |
| Who owes the most | Top 10 debtors, each with how many months they are behind, tappable through to the customer |
| What is owed for | Gross by debt category (months / sales / custom) |

Only one figure here is period-scoped. See gotcha #91 — outstanding debt is all-time by design, and the two are labelled apart on purpose.

### How the data is built

Two arrays feed almost everything, and both come from code that already existed.

**Money out needs no new query at all**: `ExpenseService.getExpensesView` already returns `ExpenseItem[]` carrying date, amount, currency, frozen rate, branch, staff, category and product — with the derived stock half merged and the branch semantics of gotcha #88 applied.

**Money in** is three new reads, one per stream, all returning the same `CollectedRow` shape:

| Repository | Method |
| --- | --- |
| `ICollectionRepository` | `collectedInRange(startIso, endExclusiveIso, branchFilter)` — ONE read, one row per bill settled |
| `ISaleRepository` | `collectedInRange(…)` |

Each lives on the repository that owns its table (never a cross-table `ReportsRepository`, which would have to re-derive the branch scoping `BRANCH_SCOPES` already encodes), and each has a Supabase impl and an offline SQLite twin. `ReportsService` tags them with their `stream` and merges them into one `CashRow[]`.

Everything else — by stream, by category, by currency, the comparison, and every drill-down — is **pure client-side aggregation** in `reports/utils/aggregate.ts` (`sumByKey`, `topN`, `shareOfTotal`, `delta`). **One query per stream per window**, so a 12-month report costs the same round trips as a 1-month one.

Revenue is **cash collected**, exactly as on the dashboard, and from the same one read: `collection_items` by `collections.received_at`, each summed in USD via the collection's frozen `rate_per_usd_snapshot`. Reports and dashboard must reconcile to the cent for a single month — that is the acceptance test, and it is now hard to fail, because both call `CollectionService.collectedInRange`.

### Drill-down

Tapping a breakdown row or the debts card opens `RecordsSheet` with the records behind that number. It is always a **filter over rows already in memory** — never a second query — which is also what guarantees the rows add up to exactly the figure that was tapped.

### Export

The header's download button writes the section as CSV and hands it to the system share sheet (`expo-file-system` + `expo-sharing`); on web, where `expo-sharing` is a no-op, it falls back to a plain browser download. `src/shared/lib/csv.ts` does the RFC-4180 quoting and writes a UTF-8 BOM, so a customer name with a comma does not split a cell and Arabic opens correctly in Excel. The money sheet writes spending as **negative** rows, so its Amount column sums to the report's Net.

### Reusable pieces

A phase-2 report is a config object plus a data hook, because the presentation is already built: `ReportSection` (loading / error / empty / pull-to-refresh), `KpiRow`, `ReportCard`, `BreakdownList`, `RankedList`, `ComparisonPill`, `CurrencySplit` and `RecordsSheet`, with one palette in `reports/utils/reportColors.ts` so a stream keeps its colour on every card.

**There are no charts.** A charting library (`react-native-svg` + `react-native-gifted-charts`) was fitted and then taken back out — the numbers, the share bars and the drill-downs carry the reports on their own, and the library cost a native rebuild for decoration. Do not reintroduce one without a figure that genuinely cannot be read as a list.

Three things moved out of single-use homes on the way, and the reports then reuse them rather than re-writing: `StatTile` → `src/shared/components/`, the date-range helpers → `src/core/utils/dateRange.ts`, and the wallet's per-currency fold → `groupByCurrency` in `src/core/utils/currency.ts`.

### Release

This is **not** an OTA release. `expo-file-system` and `expo-sharing` (the CSV export) change the native fingerprint, so the installed build can never receive it — `npm run build-prod` plus a reinstall is required. The range reports scan `collections (tenant_id, received_at)`, which the ledger schema indexes. No table or column changes — the whole feature is read-only.

---

## Expenses

The app counted only money **in** — every hand-over summed into `monthlyRevenue`. Expenses are the other half, so the dashboard can answer "did I actually make money?". **Admin-only end to end** (RLS on the table, and the UI drops the segment, the quick action and the dashboard tiles for anyone else): rent and salaries are not staff business.

**Two sources, one view.** `ExpenseService.getExpensesView({ startIso, endExclusiveIso, branchFilter })` composes them into a uniform `ExpenseItem[]` + a USD `ExpenseSummary` — the same shape `LedgerService` uses (stored rows + a derived stream from another service):

| Source | Where it comes from |
| --- | --- |
| `manual` | Hand-typed rows in the `expenses` table (rent, salaries, fuel, …) |
| `stock` | **Derived** at read time from `stock_movements` — costed, non-voided, non-`'sale'` rows; `amount = quantity_delta × unit_cost`, so a costed **negative** row is a negative amount (money back) — older data only, since a manual entry can no longer remove stock |

**A restock never writes an expense row.** Deriving it means correcting the stock corrects the expense, with no second insert inside the offline restock transaction, no drift on a void, and no orphan when a hard-deleted product takes its ledger with it. The cost of that choice is that a derived row **cannot be voided** (`ExpenseItem.canVoid` is false; its 3-dot offers "Open product") — a wrong cost is fixed on the entry that carries it — **Edit entry** for a mistyped one, **Revert entry** for one that should never have existed — and both take the money off the month that entry belongs to (see [Stock](#stock) → cost, and gotchas #94 / #96). Row ids are prefixed (`exp:` / `stock:`) so the two sources can never collide.

**Credits print `+`, in green.** A negative amount is the one figure on this screen that is not money leaving, so `outflowLabel()` — used by the card, the total-spent headline and every month section total — flips the leading `−` to `+` over the absolute value. Without it a credit reads `−-$5.00`. Its label says what it is (`Water ×2 returned`) instead of `×-2`.

**Cash basis, exactly like revenue.** A purchase counts in the month it was **paid for**, never the month the goods sell — no FIFO, no cost layering, and unsold stock is inventory rather than a loss. Manual rows key off `incurred_at`, a **user-picked date** (last month's rent entered today belongs to last month), not `created_at`.

**`expenses` table** — `branch_id` (its **own**, `NULL` = a company-wide expense), `category` (free text at the DB level; the app owns the code list, so a new category needs no migration), `description`, `amount` + `currency_id` + `rate_per_usd_snapshot` (the standard frozen-rate trio), `recorded_by_user_id`, `incurred_at`, soft-void fields. **Void-only, no edit** — a typo is voided and re-entered, so the row is its own history and the table is deliberately **not audited** (the same call as the debt tables). No tier gating.

**Branch semantics: one rule, and it is `owned` on both halves.** `expenses.branch_id` is `owned`, and NULL means **the company bought it, no branch did** — so a company-wide expense shows in the **All branches** view only (the "Unassigned" chip reaches it on its own). The *derived* half follows the same rule via the parent **product**: `stock_movements: { kind: 'inherited', joinedTable: 'products' }`, deliberately narrower than the stock RLS policy. Both exist for the same reason — **branch views must sum to the tenant total**. Making either one `shared` puts head-office rent, or a shared product's delivery, into every branch's expenses at once, and two branch admins each read the same money as theirs. The RLS policy is wider than the app filter on purpose: visibility and aggregation are different questions. Gotcha #88.

**UI.** An **Expenses** segment in the Transactions hub (admin-only) plus an "Add expense" quick action. `ExpensesPanel` reads a **date window** (the current calendar month by default) rather than paginating, so section totals are always the local sum: a total-spent headline with a stock/other split, search + category + From/To chips, then a month-grouped `SectionList` via the shared `groupByMonth` / `MonthSectionHeader`. Every amount carries a leading `−`. `ExpenseFormSheet` is the `CustomDebtFormSheet` shape (category `Dropdown`, `CurrencyInput`, `DatePickerInput` capped at today, branch picker, description).

**Dashboard.** `DashboardMetrics` gains `monthlyExpenses` / `stockExpenses` / `customExpenses` / `netIncome`. **`monthlyRevenue` stays GROSS** — `netIncome` is the subtraction, so `prevMonthRevenue` and the vs-last-month pill keep their meaning. The hero card gains an orange `Expenses $X` chip (unsigned, like `outflowLabel()` on the Expenses tab) beside the red "Owed by customers −$X" one (orange vs red because they mean different things — money already spent vs money not yet collected) and a `Net this month` line, red when negative; two full-width tiles follow. Admin-only throughout: `getMetrics` reuses the wallet's `viewer` gate.

**Code map:** `src/modules/transaction/expenses/` (repository + service + `expenseCategories.ts` + panel/card/form), the `expenses` slice + `useExpenseSlice`, `stockCostsInRange` on `IProductRepository`. See gotchas #88, #89 and #94; QA [expenses.md](../QA/expenses.md).

---

## WhatsApp Invoices

Staff can send the customer a **plain-text receipt over WhatsApp** — at the moment the money is taken, or later from the saved record. It is a `wa.me` deep link end to end: no PDF, no printing, no new dependency, no DB change, no server work. Everything lives in the small `src/modules/invoicing/` module.

**The module (4 files).**

- `utils/invoiceText.ts` — **pure** builders, no React and no i18n singleton: `t` arrives inside an `InvoiceContext { t, orgName, locale, currencies, displayCurrencyId }` (the same "pass `t` in" pattern as `blockRangeLabel.ts`). Exports `buildPaymentInvoiceText(ctx, customerName, rows)`, `buildSaleInvoiceText(ctx, sale, customerName)` and `buildSalesInvoiceText(ctx, sales, customerName)` (which falls back to the single-sale layout for one row, so a lone sale always produces the same document). It is **not a Service** — it decides nothing, validates nothing, throws nothing. It lives in a module rather than `src/core/` only because it reuses `getBlockRangeLabel`, and Core may not import from a module.
- `utils/invoiceRecipient.ts` — pure: collapses the rows of a multi-row receipt to the ONE customer it can be sent to, or names why it can't (`mixed` / `no_customer` / `no_phone`). Callers map their own row type down to `InvoiceRecipientRow { customerId, customerName, phone }`.
- `hooks/useSendInvoice.ts` — the one place that turns a saved record into a message. Gathers the context from the stores (`useAuthSlice` tenant name, `useCurrencySlice`, `useDisplayCurrencyId`, `useLanguageStore`, `useTranslation`), calls `openWhatsApp`, and on a `false` result shows the `confirm({ hideCancel: true })` dialog. Returns `{ canSend, resolveRecipient, sendPaymentInvoice, sendSaleInvoice, sendSalesInvoice }`; `resolveRecipient` is the recipient util plus the dialog that explains a refusal.
- `components/SendOnWhatsAppButton.tsx` — the app's single green (`bg-[#25D366]` + `logo-whatsapp`) action row. Matches `Button`'s geometry but is its own component because `Button` takes no icon and no `className`. `ContactToUpgradeButton` was re-pointed at it, so that markup now exists once.

**Entry points.**

| Where | Action |
| --- | --- |
| `CollectSheet` | (via each surface's own send flag) the hand-over it writes is sent as one receipt |
| `SaleFormSheet` | a second, stacked button — **Save & send on WhatsApp**, using the `Sale` `createSale` already returns |
| Quick pay — month-cell menu (`CustomerPaymentPanel`) + customer-card menu (`CustomerListScreen`) | a **Pay & send on WhatsApp** row beside "Quick pay" |
| **Month-grid multi-select** (`InlineSelectionToolbar`) | a green WhatsApp action beside "Collect" — one receipt for the hand-over it writes |
| `BillSheet` / the money-in history row menu | **Send on WhatsApp**, to re-send a saved hand-over any time |
| `SaleDetailSheet` + the three sales lists | **Send invoice on WhatsApp** — one sale, or one receipt covering a selection |

Stacked, not side-by-side: `Button` takes no `className`, and the long label (and its Arabic form) truncates at half a phone width.

**Both busy states are one marker, not two flags.** Each form tracks `busyOn: "save" | "send" | null`, set **before** the write and cleared in a `finally`, so the spinner stays on the button the user actually pressed across both phases (the store write, then the awaited deep link). Consequently `canSubmit` / `submitDisabled` are **validity-only** — folding the slice's loading flag into them greys out *both* buttons, and a disabled `SendOnWhatsAppButton` shows no spinner at all.

**No phone → visible but disabled, with a caption.** `canSend` digit-strips exactly like `openWhatsApp`, so `"-"` or `"n/a"` disables rather than producing a broken link. The button caption is `invoice.no_phone`, or `invoice.no_customer` for a walk-in sale; the menu rows use `ActionMenuItem.caption` for the same hint. **A voided hand-over or sale never shows the button** — a cancelled receipt is not a receipt.

**A receipt is ONE hand-over, and that simplified the whole builder.** `buildCollectionInvoiceText` replaced the old multi-row payment builder, and three rules it needed simply stopped existing:

- **One currency**, because a collection is single-currency — so no "one Total per distinct currency" any more, just one amount.
- **One date**, because a hand-over happens once — so no "date each bullet when the rows weren't collected together".
- **One customer**, because a collection belongs to one — so no `resolveRecipient` refusing a mixed selection.

What is left is the split: a hand-over that settled one bill names it above the amount, and one that settled several lists them as bullets under **"This pays"**, oldest bill first. The old rules were all workarounds for receipts assembled out of unrelated rows; the model now produces the receipt directly.

**Message format** (owned entirely by `invoiceText.ts`): `*Org name*` bold header + a receipt title, then `Label: value` lines, list rows prefixed with a literal `•`, and an `invoice.thank_you` footer. Amounts are `formatMoney(v, source, source)` where `source = snapshotCurrency(row, currencies)` — the literal cash at the row's frozen rate — with a ` (≈ …)` display-currency suffix on the **one** headline amount only. The date uses `getDateLocale(language)`, which always returns `en-US`: `formatMoney` hardcodes Latin digits, so an `"ar"` date would mix numeral systems inside one message.

**A multi-plan or multi-month collection is naturally one message**, because it is naturally one row. `CustomerListScreen`'s "collect all due" groups a customer's lines **by currency** and writes one collection per group (a collection cannot mix currencies), so a customer billed in two currencies receives two receipts — which is correct: he handed over two piles of cash.

**Several sales still need the multi-row builder**, and `buildSalesInvoiceText` is unchanged: a sales-list selection is genuinely a set of unrelated records, so it keeps the oldest-first sort, the per-currency totals and `resolveRecipient`'s refusal of a mixed selection.

**Getting the created record back.** `ledger.collect` returns the created `Collection` (no new state field), which is all a receipt needs — the header, its split, and its id.

See gotchas #68, #69, #80. QA: [../QA/whatsapp-invoices.md](../QA/whatsapp-invoices.md).

---

## Transactions Hub

The bottom **Transactions** tab (`app/(app)/(tabs)/transactions`) is a hub hosting in-page segments via the shared `SegmentedTabs` control: **Debts** (default), **Sales**, and — for admins — **Expenses**. `TransactionsScreen` owns the page chrome (SafeAreaView + title + `BranchSelector` + segments); each segment is a self-contained **panel** that owns its own body (filters, list, sheets, multi-select) but not the chrome. The selection toolbar that used to live inside `PageHeader` was extracted into a shared `SelectionBar` so panels (which have no `PageHeader`) can render it; `PageHeader` re-uses `SelectionBar` and re-exports `SelectionAction` for back-compat. While a panel is in selection mode it **replaces its filter row** with the single `SelectionBar` (see the shared selection row below).

- **Debts** → `DebtsPanel` (see [The Ledger](#the-ledger-charges--collections) — `ledger` slice).
- **Sales** → `SalesPanel` (the former `SalesListScreen` body, behavior unchanged — `sales` slice).
- **Expenses** → `ExpensesPanel` (see [Expenses](#expenses) — `expenses` slice). **Admin-only**: the segment is dropped from the array entirely for a non-admin, matching the RLS on the table.

> **There is no Services segment.** It existed as a "coming soon" placeholder and was **removed** when services shipped, because a service turned out to be a **line on a sale** rather than its own record — so the Sales tab already lists every one of them, and the price list belongs at Admin → Services. See [Products & One-Off Sales → Services](#services).

> **The money-in history is a sheet, not a tab.** `CollectionsPanel` lives in a
> full-height bottom sheet (`CollectionsHistorySheet`) launched from the
> **PageHeader 3-dot quick-actions menu** ("Money received", first item) on any
> screen, riding the same `ui`-slice / `QuickActionSheets` seam as the other
> quick-add sheets. It is **one** list where there used to be two: a month, a
> sale and a custom fee are all settled by the same `collections` row, so the
> payments history and the debt-payments history had nothing left to keep apart.
>
> **Voided hand-overs STAY in the list, marked** — history is a record of what
> happened, so the read passes `includeVoided: true` and `voidCollections`
> **merges** the voided rows back into `items` instead of dropping them. Money
> never counts one: `monthlyTotals` excludes voided rows server-side, and the
> panel's own per-row sum returns 0 for them. The **month grid is untouched** —
> it keys off collected money, and a voided collection contributes none.

**Month-grouped lists.** Sales, Payments, and Debts all render as a `SectionList` grouped by calendar month, newest first — one section header per month ("This Month" for the current month, else "June 2026"). The two newest buckets break out ahead of the months: **Today** (`common.today`) and **This Week** (`common.this_week`, Monday-based week start, excluding today) — a row lands in exactly one bucket (today → this week → its month). The grouping is a pure view transform (`groupByMonth` in [monthSections.ts](../SubsTrack/src/shared/lib/monthSections.ts)) over the **already date-desc-sorted** slice data, so the slice/service stays the single source of sort order — it only buckets, it never re-sorts. Day/week bucket totals are always summed locally (their newest rows are guaranteed loaded); a month whose newest rows were peeled into Today/This-Week has that peeled USD subtracted from its authoritative `totalsByMonth` total so the header still reads the correct remainder. Each panel supplies the row's date: Sales → `soldAt`, money received → `receivedAt`. (Debts is a flat debtors list — it has no month sections.) Headers render via the shared `MonthSectionHeader`; sticky headers are disabled. Selection / select-all still resolve against the flat slice array (the sections are built from it), so multi-select is unaffected. Full month names come from the `months_long` i18n block; "This Month" from `common.current_month`.
  - **Month totals.** Each panel also passes `groupByMonth` a `getAmountUsd` row-to-USD function, so every section carries a `totalUsd`; `MonthSectionHeader` renders it (formatted into the display currency) at the trailing edge of the header, next to the row count. Sales sum the **value sold** (`totalAmount`, matching `soldAt`); the money-in history sums the **cash received** (`amount / ratePerUsdSnapshot`, matching `receivedAt`). (Debts no longer uses month sections — it's a flat debtors list; the debtor detail modal groups a customer's debts/payments via the shared `DebtList`.)
    - **Sales/Payments are paginated (`PAGE_SIZE` = 30) — summing only the loaded rows would under-count any month with more rows than one page.** Both panels instead pass `groupByMonth` a 5th arg, `totalsByMonth: Record<"YYYY-MM", number>`, which — for any month key present — overrides the local per-row sum. That map comes from `saleSlice`/`collections`'s `monthlyTotals` state, refetched (in parallel with the paginated page) every time filters change via `SaleService.getMonthlyTotals` / `CollectionService.getMonthlyTotals`, and **patched in place after a write** by `addMonthTotal(totals, iso, deltaUsd)` — recording, correcting or voiding a row moves its month by that row's value instead of re-running the aggregate (a month the map does not hold is left alone: it was never fetched, so `groupByMonth` is already summing it locally), which bucket `SaleRepository.monthlyTotals` / `CollectionRepository.monthlyTotals` — the **same filters as `findAll`, but unpaginated and projected to just the 2–3 numeric columns needed to sum** (no joins beyond what a search/branch filter needs), so it stays cheap even over a whole table. `fetchMoreSales`/`fetchMoreCollections` (loading further pages of an unchanged filter set) do **not** refetch it — the total doesn't change, only which rows are visible. Debts isn't paginated (it loads its full filtered set up front), so it never passes this arg and keeps summing locally.

**Money received (tenant-wide):** `CollectionsPanel` lists every hand-over of
cash across all customers, newest first, defaulting to **this month**. Backed by
the `collections` slice + `CollectionRepository.find` +
`CollectionService.getHistory` (returns `CollectionListItem` — the header, its
split, the joined customer name and phone, and the one `kind` every line shares
or `'mixed'`). Branch scoping is the collection's **own** `branch_id` (gotcha
#103). Multi-select enables bulk void. The per-customer `payments` slice and the
month grid are untouched.

**The card answers four questions, in reading order** — who paid, how much, what
it paid, who holds the cash: the **customer's name** leads (bold, left) with the
amount bold on the right, the second line **names the bills** (`collectionLabel`
— the first two labels, then `+N more`; a bare "3 items" count named nothing),
and the third is the **collector** plus the moment the cash arrived, printed to
the **minute** (`formatDateTime`). The kind is told **twice**: by the **icon's
colour** and by a **kind chip** in words (Month / Sale / Custom / Mixed), both
read off one `KIND_STYLE` row (month and sale emerald — a sale is emerald
app-wide, so the receipt glyph parts them — manual violet, mixed indigo). The
chip was briefly dropped, because one emerald badge on every kind made the list
a green wall, and it came back the moment sale and month started sharing a
colour: a glyph alone is too quiet to classify a row, so the fix is to **tint
the chip per kind**, never to delete it. The other chips are exceptions only:
`N items`, the **holder**
(amber, and only when custody has actually moved — a collector still holding
their own cash gets none), and a red `Voided` carrying its reason under a
struck-through amount. **Amounts print in the currency physically handed over**
(`formatMoneyPair`, gotcha #128), with the display-currency value as a small `≈`
line under it and only when it differs.

**Chrome:** a `PeriodPicker` (the same one Reports uses — the window is now a
visible chip instead of a silent one-month default), then chips for **Customer**,
**Collected by**, **Type**, **Status** (not voided / voided only), **Sort by**
(Received date / Recorded date / Last updated) and **Order** (newest / oldest
first), then one **summary bar** — "Collected in this view" — which sums the
slice's unpaginated `monthlyTotals`, so it covers every matching row rather than
the loaded page. **Type filters on the frozen `collections.kind`** (gotcha #128);
status maps onto `includeVoided` / `voidedOnly` and the sort onto `sortField` +
`sortDirection`, all four server-side in both repositories, so paging stays
correct. **Sort by offers only dates the hand-over itself owns** — a due date
belongs to the bills it paid, of which there can be several, and an amount sort
across currencies would have to be an expression; both are left out on purpose
(gotcha #129). Received and recorded genuinely differ, because a received date
is user-picked and can be back-dated.

**Tapping a row opens what it settled** — the bill itself for a single-bill
hand-over, `CollectionSplitSheet` when it settled several, and **always the
split for a voided row**, whatever it settled: the bill behind a reversal is
owed again, so it is no longer that row's story. A voided row used to open
nothing at all, which left the one question staff actually ask — who cancelled
this, when, and why — with no surface to answer it. So the sheet keeps the
**kind** pill and adds a red **Voided** one beside it (a void does not change
what the cash paid for), names the void's time, **its author** (`voidedBy`,
carried on `CollectionListItem` and patched into the store by `applyVoided`, so
it is right the instant you void) and its reason, heads the bills **"This had
paid"** with the caption *these bills are owed again*, and drops the custody row
entirely — a voided hand-over holds no cash, so "now with Sami" would be a lie. That sheet is the
hand-over's whole record: the total (+ `≈`), a status pill, then an `InfoRows`
block (customer · received to the minute · who took it · where the cash is now,
or "Banked" · **notes**, which were stored but shown nowhere before · the void
time and reason), then one `CollectionItemCard` per bill carrying the **bill's**
total, due date and billing instant. A bill card deliberately does **not** print
a remaining balance: that is the sum of every hand-over against the bill, so it
belongs to `BillSheet`, one tap away. `BillSheet` gained the same depth (customer,
month billed, bill total, due date, billed-at to the minute, who billed it,
notes) and now speaks the **bill's own currency** throughout — hero, remaining
and every payment row — with one `≈` display line under the hero.

---

## The Ledger (charges + collections)

Everything about money — what is owed, and what was handed over — lives in three
tables. This replaced the whole `payments` / `custom_debts` / `debt_payments`
family, and the reason is one sentence:

> `payments.amount_paid` and `sales.amount_paid` each hold **one number and one
> date**, so when a customer pays 12 now and 8 next month there is nowhere for
> the 8 to go.

Raise `amount_paid` and the 8 counts as revenue on the original date; leave it
and the row says he still owes it forever. Every debt problem the app had grew
from that: `debt_payments` was a workaround that could only point at a
*customer*, never at which month or sale it paid; debt was a customer-level
`Σ categories − Σ payments`, so no individual line's balance was trustworthy;
"Complete" existed only because `amount_paid` had no date of its own.

### The model

| Table | Role | One row = |
| --- | --- | --- |
| `charges` | what is owed — **the bill** | a month, a sale, or a hand-typed fee |
| `collections` | money physically handed over | one hand-over: "$55, 5 Mar, taken by Sami" |
| `collection_items` | which bill that money paid | one bill touched by that hand-over |

A bill can take many payments and a payment can cover many bills — a genuine
many-to-many, which is exactly why the middle table exists. Partial payments,
installments, pay-later sales and oldest-first collection then all fall out for
free, and the wallet, the dashboard and Reports each collapse to a single source.

```
balance(charge)  = charge.amount − Σ collection_items (of non-voided collections)
debt(customer)   = Σ balance where balance > 0 AND (kind <> 'month' OR paid > 0)
owed(customer)   = debt items + unpaid months from buildMonthGrid, deduped on
                   (customer_plan_id, billing_month) — the charge row WINS
revenue(period)  = Σ collection_items in the period, by collections.received_at
wallet(user)     = Σ collections where held_by_user_id = user, per currency
```

**Nothing asks "does a charge row exist?" — everything asks "how much money came
in?"** A month bill left at 0 collected (after a void) reads *identically* to no
row at all. Miss this and a voided payment leaves a ghost debt behind.

### Balance is never a column

`charge_balances` is a `security_invoker` view (the `product_stock` precedent);
offline the same `GROUP BY` runs over the mirror, so one mapper serves both. Two
devices can therefore both collect offline without clobbering a counter.

> **The view's `CASE` is load-bearing.** `p.voided_at IS NULL` sits in a LEFT
> JOIN's `ON` clause, which does not *drop* an item whose collection was voided —
> it only leaves the joined row all-NULL. A bare `SUM(i.amount)` keeps counting
> voided cash, and voiding a payment never gives the balance back.

### The waterfall

`ledger/utils/waterfall.ts` is pure — no I/O, no clock. `allocate(amount, items)`
spreads money **oldest due date first, filling each bill completely** before
moving on. Never proportional: a customer settles his oldest bill, he does not
part-pay all of them.

The sort has **four levels**, and each earns its place:

1. `dueDate` — when it HAD to be paid. Never the date it was typed, or a fee
   back-dated to 2020 would jump the whole queue (gotcha #74 in a new place).
2. `issuedAt` — a January month billed today loses to one billed last week.
3. `createdAt`
4. `keyOf(item)` — a total order, so the preview and the save can never disagree
   and two devices splitting the same money land identically.

Leftover money means **overpay**, and the service refuses it: there is nowhere
for unapplied cash to live.

### Virtual months

A month has **no charge row until money reaches it**. `LedgerService.getOwed`
therefore merges two sources — stored bills, and unpaid months derived from
`buildMonthGrid` — deduped on `(customer_plan_id, billing_month)` with a
**PAID stored bill winning**. Miss the dedupe and an empty month charge left by a
voided collection is counted twice.

An **EMPTY** stored bill (nothing collected) deliberately LOSES the dedupe: it
must read like a month never touched, price included, so the virtual month wins
and carries the line's CURRENT price. The grid takes the same branch in
`monthItemFromEntry` (`entry.collected > 0`, not `entry.charge`), and both
`CollectionRepository.create` paths re-price the stored row to match before
collecting — otherwise the sheet would show the new price and bill the old one.
A bill money has reached always keeps its frozen amount. See gotcha #106b.

Collecting is what turns a month into a bill: `CollectionService.collect`
materializes it in the same write, with an id from
`deterministicId(customer_plan_id, billing_month)` — so two devices collecting
the same month offline converge on ONE row instead of billing the customer
twice.

### A line with no set price

A custom-price plan — or a customer with no plan at all — has no figure to bill,
so `resolveLinePrice` returns `kind: 'typed'` and **`getOwed` skips the line
entirely**: nothing can be poured over a bill whose amount nobody has typed. The
month cell still collects. It builds an **open item** (`OpenItem.openAmount`,
amount / balance / currency all empty) and the collect sheet grows one extra
field, **Amount for this month** — that field IS the bill, and it also decides
the currency, since an open item has none of its own.

Three rules:

- **Single item only.** Two open months in one write are two different unknown
  amounts, so a grid multi-select containing one is refused with a message.
  Quick pay follows the same rule: one price-less line opens the sheet on the
  customer list itself, two send you to the month grid.
- **Once the amount is typed the item becomes an ordinary bill**
  (`billedOpenItem` in `CollectSheet`), so a part payment, the "leaves N owing"
  hint and the overpay refusal are the existing code, not a second
  implementation. "Owed 50, paid 20" works exactly as it does for a priced line.
- **The bill is raised at what was typed**, in the hand-over's currency:
  `CollectionService.materialize` uses `item.amount > 0 ? item.amount : line.amount`.

Once that first bill exists the line behaves like any other — the remainder is a
debt, and the Debts screen and the waterfall both see it. See gotcha #112.

### Owed vs debt

| | includes | consumed by |
| --- | --- | --- |
| **OWED** | everything with a balance, plain unpaid months included | the waterfall, and only the waterfall |
| **DEBT** | partly-paid months, open/partly-paid sales, hand-typed fees | the Debts screen |

`isDebtItem(kind, paid) = kind !== 'month' || paid > 0` — one function, in
`ledger/utils/openItems.ts`. **A fully unpaid month is NOT a debt**: it is
`unpaid`/`overdue` in the month grid, which is its own screen and its own
workflow. It becomes a debt the moment it is *partly* paid, which is exactly
when it stops being routine.

**The Debts screen never lists a plain unpaid month at all**, and that is
structural, not a filter: `getDebtsView` reads **stored bills only** (no virtual
pass — do not add one), and a month has no bill until money reaches it. So the
`unpaidMonths` section fills only from **partly-paid** months. The one leak was
an **empty** bill — a month paid and then voided keeps its `charges` row with
`paid = 0` — which made voiding a payment the single way an unpaid month could
appear there, showing that lone month while the customer's genuinely unpaid
months stayed hidden. `buildDebtsView` now drops `kind === 'month' && paid <= 0`,
so an emptied bill reads exactly like a month never touched (gotchas #106,
#106c).

### Void vs write-off

Two different statements about one bill, and `chk_charges_void_xor_write_off`
keeps them mutually exclusive:

| | means | effect |
| --- | --- | --- |
| **void** (`voided_at`) | it was a MISTAKE — it never existed | gone from every figure. `voidCharge` is refused once money sits on it; `voidChargeWithPayments` is the deliberate "take the cash with it" door (see below) |
| **write off** (`written_off_at`) | it is REAL but will never be paid | leaves "still owed", reported as a **loss** in Reports → Debts |

Voiding a **collection** is the third, and different again: the cash was real
but should not have been recorded. Every bill it touched gets its balance back
on its own, because a balance is a sum over live items and this row stops being
one.

**A dead bill still owns its month, so collecting it REVIVES it.** `charges`
is unique on `(customer_plan_id, billing_month)` whatever the row's state, so a
voided or written-off month bill is the only row that month can ever have —
while every read (the grid, the debts screen, `charge_balances`) filters it out.
Cash aimed at that month would therefore be saved onto a row nothing can see:
counted in the wallet and in revenue, but the cell red again on the next
refresh, for ever. So the write fixes its target first. `reviveTargetBill(s)`
does two INDEPENDENT things: it clears all six void / write-off columns
**unconditionally** whenever money is about to land (cash contradicts both "it
was a mistake" and "it will never be paid"), and separately re-prices an EMPTY
month bill. Keeping them independent is the whole lesson — the un-void used to
be bundled into the re-price and so ran only when the price happened to have
moved. Two supporting rules: the paid check that guards the re-price sums
`collection_items` directly (a balance read hides the very row being fixed and
would answer 0), and `charge_balances` now excludes **only** voided bills,
because a write-off gives up on the remainder and does not un-collect what was
already handed over. "No longer owed" is decided in one place,
`ChargeRepository.find`. Gotcha #115.

### One currency per hand-over

A collection carries one currency, and it must equal the currency of every
charge it pays — which is why `collection_items` has **no currency or rate of
its own**. That is what lets a balance close at exactly zero, with no rate drift.
A customer owing in two currencies is collected from twice, and the collect
sheet shows a currency picker to say so. USD for revenue and the wallet uses the
**collection's** frozen rate (what physically arrived); USD for a debt total uses
the **charge's** (what he was billed).

### Screens

| Where | What |
| --- | --- |
| `CollectSheet` | the ONE collect form. Two modes: a whole customer (type an amount, watch the waterfall split it, untick a row to steer the cash on) or a single bill. Same write either way, so one code path and one audit shape. |
| `BillSheet` | one bill: a running `15 / 20 # Feature Deep-Dives

> Detailed behavior for each feature area. Read the relevant section BEFORE editing that area's code. Referenced from `CLAUDE.md`.
> The Month Grid algorithm itself stays in `CLAUDE.md` (it is the single most critical rule). This file covers everything built around it.

## Contents

- [Multi-Tenancy](#multi-tenancy)
- [Branches (multi-location)](#branches-multi-location)
- [Authentication Flow](#authentication-flow)
- [Multi-Month Plans](#multi-month-plans)
- [Multi-Currency](#multi-currency)
- [App Options (Global Config)](#app-options-global-config)
- [Tenant Settings (Per-Tenant Config)](#tenant-settings-per-tenant-config)
- [Subscription Tiers](#subscription-tiers)
- [Products & One-Off Sales](#products--one-off-sales)
  - [Services](#services)
- [Reports](#reports)
- [Expenses](#expenses)
- [WhatsApp Invoices](#whatsapp-invoices)
- [Transactions Hub](#transactions-hub)
- [The Ledger (charges + collections)](#the-ledger-charges--collections)
- [Regular Customer](#regular-customer)
- [Skipped Months](#skipped-months)
- [Multiple Plans per Customer (service lines)](#multiple-plans-per-customer-service-lines)
- [Pay Oldest Month First](#pay-oldest-month-first)
- [Payment Scenarios](#payment-scenarios)
- [Multi-Select & Bulk Actions](#multi-select--bulk-actions)
- [Audit Trail](#audit-trail)
- [Developer Tools](#developer-tools)

---

## Multi-Tenancy

- **RLS is the primary guard** — all queries automatically scoped to the caller's tenant via Supabase JWT claims.
- **App-level filtering** (`tenant_id` from `authStore`) is a secondary belt-and-suspenders guard.
- `tenant_id` is injected into the JWT by a Supabase auth hook at login. **Never derive it from client input.**
- Login email convention: `username@tenantcode.com` (synthetic, not a real email address).

---

## Branches (multi-location)

Tenants can optionally create branches/zones. A tenant with zero branches behaves exactly as before — feature is invisible.

**NULL semantics differ per table:**

| Table       | `branch_id IS NULL` means                                      |
| ----------- | -------------------------------------------------------------- |
| `users`     | Tenant-wide admin (sees all branches and unassigned records).  |
| `customers` | UNASSIGNED — visible only to tenant-wide admins.               |
| `plans`     | SHARED catalog item — visible to every branch.                 |
| `payments`  | (no `branch_id` column — inherits from customer via FK + JOIN) |

**RLS layered on tenant_id:**

- `public.current_branch_id()` reads `users.branch_id` for the calling user (SECURITY DEFINER).
- Policies admit a row when `tenant_id` matches AND either the caller is tenant-wide (`current_branch_id() IS NULL`) or the row's branch matches. Plans additionally admit `branch_id IS NULL` (shared) for everyone.
- Payments inherit via `EXISTS (SELECT 1 FROM customers c WHERE c.id = payments.customer_id AND c.branch_id = current_branch_id())`.
- Branch switching for tenant-wide admins is purely UI state in `uiPrefStore.currentBranchId` — no JWT change.

**UI:**

- [BranchSelector](../SubsTrack/src/shared/components/BranchSelector.tsx) is a chip rendered below `PageHeader` on Customers/Dashboard/Plans/Users. It self-conceals: only renders for tenant-wide admins (`user.branchId === null`) when ≥1 active branch exists.
- Options: All Branches (`null`) / each active branch / Unassigned (`BRANCH_FILTER_UNASSIGNED`).
- `useEffectiveBranchFilter()` / `resolveBranchFilter(user)` in [branchFilter.ts](../SubsTrack/src/shared/lib/branchFilter.ts) returns the active filter: branch-scoped users always get their own `branchId`; tenant-wide admins get `uiPrefStore.currentBranchId`.
- `applyBranchFilter(query, filter, column?)` mutates a supabase query builder: `null` → no-op, `BRANCH_FILTER_UNASSIGNED` → `.is(column, null)`, UUID → `.eq(column, uuid)`.

**Form behavior:**

- CustomerFormSheet: Branch picker only shown to tenant-wide admins. Branch-scoped users auto-assign their own branch. The plan dropdown filters to `branch_id IS NULL OR branch_id = selected_branch`, and the inline Plans editor's `PlanPicker` is **disabled** (greyed, with a "Select a branch first" hint) while no branch is chosen (`branchId === null`) — branch is required, so a plan can't be picked before it. `Dropdown` grew a `disabled`/`disabledHint` prop for this, threaded through `PlanPicker`.
- PlanFormSheet: Branch picker only for tenant-wide admins; nullable (= Shared, visible to every branch) — mirrors ProductFormSheet. Branch-scoped users always create branch-scoped plans (their own).
- UserFormSheet: Branch picker for tenant-wide admin. Once ≥1 branch exists, role=`user` requires a branch (enforced in `UserService.validate`). The `create-user` edge function additionally validates and forces branch_id for branch-scoped callers.

See gotchas #26–#32 for the full branch NULL-semantics + enforcement rules.

---

## Authentication Flow

```
app/index.tsx
  → authSlice.restoreSession()   (on mount)
  → if no session → redirect to (auth)/login
  → if session → redirect to (app)/(tabs)/home (admin) or (app)/(tabs)/customers (user)

LoginScreen
  → authSlice.login(username, tenantCode, password)
  → AuthService: email = `${username}@${tenantCode}.com`
  → AuthRepository.signIn(email, password)   [Supabase Auth]
  → AuthRepository.getUserProfile(userId)    [public.users]
  → AuthRepository.getTenant(tenantId)       [tenants joined with tier_plans]
  → stores AuthUser + tenantActive in authSlice
  → primePostAuth(user) — Promise.all of:
       get().currencies.fetchCurrencies()
       get().branches.fetchBranches()
       get().options.fetchOptions()         (loads global app_options — e.g. LiraRate)
       get().subscription.init(tenantId)
         → tierService.fetchTiers() (3 tier_plans rows)
         → tierService.fetchUsage() (counts customers/users/plans/branches/currencies)
         → tierService.getTenantWithTier(tenantId) — fresh tenant + joined tier
           → also writes back via authSlice.setUserTier so user.tenant.tier stays in sync

LoginScreen also exposes "Create a new organization" → signupSlice (2-step form):
  Step 1 (SignupOrganizationScreen)
    → signupSlice.validateAndCheckCode()
    → SignupService.validateOrganization() + repo.isTenantCodeAvailable()
    → on success → push /(auth)/signup-account
  Step 2 (SignupAccountScreen)
    → signupSlice.submit()
    → SignupService.createTenant() → SignupRepository.createTenant()
    → supabase.functions.invoke('create-tenant') [service-role server-side]
       atomically: tier_plans (lookup Free id) → tenants(tier_id=Free) →
       branches('Default Branch') → auth.users → public.users(role=superadmin, branch_id=null)
       cascading rollback on any step
    → auto-login via authSlice.login(...) with the just-entered credentials
    → root layout reacts to authSlice.user and routes into the app

app/(app)/_layout.tsx
  → if !user → redirect to login
  → if !tenantActive → show TenantInactiveScreen
  → otherwise → render tabs
```

**Hydration note:** `authSlice` exports an internal `primePostAuth(get, user)` helper called by `login` and `restoreSession`. It runs `get().currencies.fetchCurrencies()`, `get().branches.fetchBranches()`, `get().options.fetchOptions()`, and `get().subscription.init(tenantId)` in parallel via `Promise.all`. `subscription.init` is the **source of truth** for the active tier (see Subscription Tiers below).

See `docs/edge-functions.md` for `create-tenant` internals and gotcha #33 for the anon-path rationale.

---

## Multi-Month Plans

Plans can cover 1–12 consecutive months. When `durationMonths > 1`:

- The plan represents a **bundled price** for the entire period (not per-month).
- Multi-month plans **must have a fixed price** — `isCustomPrice` must be `false`.
- A single `Payment` record is created with `durationMonths` matching the plan. That payment covers all months in the range.

**Recording a multi-month payment (one bill, `duration_months > 1`):**

1. Builds a coverage set from existing active payments to detect conflicts.
2. If any months in the proposed range are already paid:
   - With `skipConflicts = false` → throws an error listing the conflicting months.
   - With `skipConflicts = true` → finds the first uncovered month, adjusts `effectiveStart` and `effectiveDuration`, records a single payment for the remaining range.
3. Returns `{ payment, skippedMonths }` so the UI can surface conflict info.

**Return types:**

```typescript
type MultiMonthConflict = { billingMonth: string; label: string };
type CreateMultiMonthPaymentResult = {
  payment: Payment;
  skippedMonths: MultiMonthConflict[];
};
```

See gotchas #13, #14, #15 for the storage + grid-rendering details.

---

## Multi-Currency

The app supports an arbitrary list of non-USD currencies per tenant. USD is the implicit base — never stored in the `currencies` table.

**Storage model: amount is as-typed, paired with `currency_id`.**

- `plans.price` + `plans.currency_id` — the price was literally `89000` in LBP (not 1.00 USD). Plan USD equivalents use the **live** rate (forward-looking pricing).
- `charges.amount` (what he was BILLED) and `collections.amount` (what he HANDED OVER), each with its own `currency_id` + `rate_per_usd_snapshot`. The customer literally handed over `89000 LBP`. **The LBP value is preserved forever**, and the USD equivalent is frozen at each row's own recording time. The two rates are deliberately separate: a debt total converts at the rate he was billed at, revenue and the wallet at the rate the cash arrived at. `BillSheet`, the year totals and every dashboard aggregate convert via the snapshot — they do not drift when the live rate is edited.
- `null currency_id` means USD throughout the codebase; USD payments store snapshot = 1.

**Conversion helpers** ([src/core/utils/currency.ts](../SubsTrack/src/core/utils/currency.ts)):

```ts
toUsd(amount, source: Currency | null): number       // null source → amount unchanged
fromUsd(amountUsd, target: Currency | null): number  // null target → amount unchanged
convert(amount, source, target): number              // go via USD
formatMoney(amount, source, target): string  // convert + Intl.NumberFormat
findCurrency(currencies, id | null): Currency | null
paymentSnapshotCurrency(payment, currencies): Currency | null  // returns the source Currency with ratePerUsd overridden by the payment's snapshot — use everywhere a historical payment amount is displayed
```

**`CurrencyInput`** ([src/shared/components/CurrencyInput.tsx](../SubsTrack/src/shared/components/CurrencyInput.tsx)) — the reusable input with an embedded currency dropdown. Used in PlanFormSheet (price) and CollectSheet (the amount received). The dropdown lists USD + active tenant currencies. Switching currency does NOT convert the typed number — switching means "I meant this number in the new currency."

**Display currency is per-TENANT, not per device** — stored in `tenant_settings` under the `DisplayCurrencyId` key (a `currencies.id`; blank/unset = USD), set by an admin in Tenant Settings and read everywhere through the `useDisplayCurrencyId()` hook. Every user of the organization therefore sees amounts in the same currency, on every device, and an admin's change reaches the others on their next sync/login. All read-only displays (PlanCard, DashboardScreen, admin/index revenue card, CustomerPaymentPanel year summary) convert their values to it at render. The currency a value was **stored in** is preserved in `BillSheet`'s primary line for receipt fidelity, with the display-currency equivalent as a secondary "≈" line. A soft-deleted / unknown id resolves to `null` via `findCurrency`, so the UI falls back to USD instead of crashing.

**Aggregates** (Dashboard) sum across mixed currencies by converting each row to USD using its `rate_per_usd_snapshot` (drift-free historical totals) in `DashboardService.getMetrics()`. The screen then formats the USD total in the tenant's display currency.

**Last-used currency** persists in [src/shared/lib/uiPrefStore.ts](../SubsTrack/src/shared/lib/uiPrefStore.ts) so the `CurrencyInput` dropdown defaults to whatever the user typed in last time.

**Currency deletion** is safety-guarded: `CurrencyService.deleteCurrency()` counts references in `plans` + `payments`. If non-zero, it does a soft-delete (sets `active = false`); otherwise it hard-deletes. `ON DELETE RESTRICT` on the FKs prevents any chance of orphaning historical data.

**Default Lebanese Pound currency.** Every newly created tenant is auto-seeded with an `LBP` (Lebanese Pound) currency (`decimals = 0`, `symbol = 'ل.ل'`). Its `rate_per_usd` is copied **once, at creation time**, from the global `app_options.LiraRate` option (see App Options below). After creation it is an ordinary editable tenant currency — the seed is a starting default, not a live link. Both tenant-creation paths seed it: SuperAdmin's `TenantService.createTenant` (via `TenantRepository.getLiraRate` + `createLbpCurrency`) and the public `create-tenant` edge function. A missing/invalid `LiraRate` never blocks signup — both paths fall back to `DEFAULT_LIRA_RATE = 89000`.

See gotchas #18, #19, #21, #22, #24, #36 for the snapshot/conversion rules.

---

## App Options (Global Config)

`app_options` is a **global, app-wide** key/value table (NOT tenant-scoped — no `tenant_id`). Columns: `id`, `key` (unique), `value` (text), `description`, timestamps. It holds cross-tenant configuration the SaaS owner controls. Seeded keys today:

- `LiraRate` — default USD→LBP rate (LBP per 1 USD) used when seeding each new tenant's LBP currency.
- `AllowPlanUpgrade` (`'true'`/`'false'`, default true) — when `false`, the in-app upgrade buttons (`TierCard`, `UpgradePromptModal`) are replaced by a "contact to upgrade" WhatsApp button that deep-links to `SupportWhatsAppNumber` with a pre-filled message. Purely a UX gate.
- `AllowSelfServiceSignup` (`'true'`/`'false'`, default true) — when `false`, the login screen hides the "Create organization" button **and** the `create-tenant` edge function rejects signups (`403`, `code: signup_disabled`) — server-side is authoritative.
- `SupportWhatsAppNumber` — support WhatsApp number (international format, digits only) used by the upgrade WhatsApp deep-link.

- **RLS:** `app_options_select` grants `SELECT` to **`anon` + `authenticated`** (anon is required because some flags gate pre-auth UI, e.g. self-service signup on the login screen). There is **no** write policy, so only the **service role** (SuperAdmin app + the `create-tenant` edge function) can insert/update/delete — RLS bypass is the write path.
- **SuperAdmin** owns full CRUD via the **Options** tab ([app/(tabs)/options.tsx](<../SuperAdmin/app/(tabs)/options.tsx>) → `OptionsScreen`). The `options` module mirrors `tier-plans` (repository + service + standalone `optionStore` + screen + `OptionFormSheet`) but adds create + delete. The option **key is immutable after creation** (only `value` + `description` are editable), so well-known keys can't be renamed out from under the code that reads them.
- **SubsTrack** has a **read-only** `options` module (repository `findAll`/`findByKey` + `OptionService.getOptions`/`getOptionValue` + `optionSlice` + `useOptionSlice`). It never writes. Options are fetched **at app bootstrap** (`app/_layout.tsx`, so the pre-auth login screen can read flags) and re-primed on login/restore via `primePostAuth`; they are intentionally **not** reset on `logout`. Reference keys through `OPTION_KEYS`, never magic strings. Read values through the typed selector hooks in [useOptionSlice.ts](../SubsTrack/src/state/hooks/useOptionSlice.ts): generic `useOptionValue(key)` / `useBooleanOption(key, fallback)`, and semantic `useCanUpgradePlan()` / `useSelfServiceSignupEnabled()` / `useSupportWhatsAppNumber()`. For **conditional UI**, prefer the declarative gate components in [FeatureGate.tsx](../SubsTrack/src/shared/components/FeatureGate.tsx) — `<CanUpgrade fallback={…}>` and `<CanCreateOrganization>` — which wrap the gated element and render `children` when enabled, else `fallback`; this keeps flag ternaries out of the screens. WhatsApp deep-links go through `openWhatsApp()` in [shared/lib/whatsapp.ts](../SubsTrack/src/shared/lib/whatsapp.ts).

See gotcha #38.

---

## Tenant Settings (Per-Tenant Config)

`tenant_settings` is the **tenant-scoped twin** of `app_options`: same key/value shape, but every row carries a `tenant_id`, and it is written **in-app by admins** rather than by the SaaS owner. Columns: `id`, `tenant_id`, `key`, `value`, timestamps, with `UNIQUE(tenant_id, key)`.

- **RLS:** `tenant_settings_select` lets **every member** of the tenant read (the values drive shared behavior, so a non-admin collector must see them too); `tenant_settings_write` restricts `ALL` to `admin` / `superadmin` of that tenant. Both scope on `current_tenant_id()`.
- **Module:** `src/modules/admin/tenant-settings/` — the usual repository (platform switch) + service + mapper + `TENANT_SETTING_KEYS`. `TenantSettingService` owns the **parsing** of raw strings into typed settings (`parseUnpaidStartRule`), so no caller ever inspects a raw value.
- **State:** the `tenantSettings` slice (loaded in `primePostAuth`, **reset on logout** — unlike the global `options` slice, since it is tenant-scoped and must not leak to the next tenant on a shared device). Read through [useTenantSettingSlice.ts](../SubsTrack/src/state/hooks/useTenantSettingSlice.ts): generic `useTenantSettingValue(key)` and semantic `useUnpaidStartRule()`. Reference keys through `TENANT_SETTING_KEYS`, never magic strings.
- **UI:** Admin → Tenant Settings, one section per setting (`UnpaidRuleSection`), matching `DisplayCurrencySection`'s card layout. Saving refreshes the current-month badge sets, since a rule change restates which months are unpaid.
- **Offline:** a normal tenant-scoped synced table. The offline write derives a **deterministic id from `(tenant_id, key)`** and upserts on that natural key (registered in `NATURAL_KEYS` **and** in `sync/push.ts`'s `conflictTarget`), so two devices setting the same option offline converge on one row instead of stalling the push on the UNIQUE index.

**Keys today:**

- `UnpaidStartRule` (`'month_start'` default \| `'customer_start_day'`) — when a month turns unpaid, and when the customer starts reading "Overdue". Those are **two** facts under `'customer_start_day'`: the **current** month is grey until the line's billing day (`isNotDueYet`), and **last** month is red but not yet *late* until that same day (`isNotLateYet`) — see gotcha #83. See [CLAUDE.md](../CLAUDE.md) → Critical Business Logic: Month Grid for the full rule; both helpers live in `customer-payments/utils/monthDueRules.ts`, shared by the grid and the customer-list aggregator.

**Adding a new key:** add it to `TENANT_SETTING_KEYS`, give `TenantSettingService` a typed setter + parser, add a semantic hook, and render a section on the screen. No schema change is needed — it is a key/value table.

---

## Subscription Tiers

Every tenant lives on one of three global `tier_plans` rows: **Free**, **Pro**, **Business**. The catalog is small and fixed (3 rows seeded by `script.sql`, editable by the SaaS owner via SuperAdmin's tier-plans module). Each tier defines numeric limits (`max_customers`, `max_users`, `max_plans`, `max_branches`, `max_currencies` — NULL means unlimited), feature flags (`multi_currency_enabled`, `multi_month_plans_enabled`), and a USD monthly price.

**Enforcement is service-layer.** Every feature `Service.createX()` calls `tierService.assertCanCreate(tier, usage, resource)` immediately after its existing `validate()`. Failures throw a typed `TierLimitError` (from [TierService.ts](../SubsTrack/src/modules/subscription/services/TierService.ts)) carrying `{resource, limit, tierCode}`. Slice actions catch via `instanceof` and set a structured `tierLimitError` field next to the standard `error: string`. Form sheets check `tierLimitError` and render an `UpgradePromptModal` (the existing `ErrorBanner` path stays for regular validation errors). This avoids parsing error strings.

**Tier and usage are passed in as parameters from components**, not read across slices in actions (slice actions still touch `get().subscription.refreshUsage()` after creates, but the _input_ tier/usage comes from the caller). The pattern in slices:

```ts
createCustomer: async (data, tenantId, tier, usage) => {
  set((s) => {
    s.customers.loading = true;
    s.customers.error = null;
    s.customers.tierLimitError = null;
  });
  try {
    const customer = await customerService.createCustomer(
      data,
      tenantId,
      tier,
      usage,
    );
    set((s) => {
      s.customers.items.unshift(customer);
      s.customers.loading = false;
    });
    void get().subscription.refreshUsage(); // ← cross-slice via get()
  } catch (e) {
    if (e instanceof TierLimitError) {
      set((s) => {
        s.customers.tierLimitError = {
          resource: e.resource,
          limit: e.limit,
          tierCode: e.tierCode,
        };
        s.customers.loading = false;
      });
    } else {
      set((s) => {
        s.customers.error = (e as Error).message;
        s.customers.loading = false;
      });
    }
  }
};
```

Components read `currentTier` and `usage` from `useSubscriptionSlice` and forward them into the action.

**Hydration:** `authSlice` exports an internal `primePostAuth(get, user)` helper called by `login` and `restoreSession`. It runs `get().currencies.fetchCurrencies()`, `get().branches.fetchBranches()`, `get().options.fetchOptions()`, and `get().subscription.init(tenantId)` in parallel via `Promise.all`. `subscription.init` is the **source of truth** for the active tier: it concurrently fetches the tier catalog, the tenant's usage, and the tenant row with its joined tier (`tierService.getTenantWithTier`), then writes the resolved tier back to `auth.user.tenant.tier` via `authSlice.setUserTier` so the auth slice stays in sync. This is why a tier upgrade made in a previous session is reflected immediately on app restart — the subscription slice never trusts a parameter-passed tier; it always re-queries the DB.

**Upgrade UX:** dedicated screen at [SubscriptionScreen.tsx](../SubsTrack/src/modules/subscription/screens/SubscriptionScreen.tsx) (routed at `/(app)/(tabs)/admin/subscription`). Shows 3 stacked TierCards with usage bars for the current tier and Upgrade/Downgrade buttons for the others. Upgrades are instant swaps via `subscriptionSlice.upgrade(tenantId, tierId)` — no billing wired up yet. Downgrades call `TierService.canDowngradeTo(targetTier, usage)` first; if usage exceeds the target tier's limits the dialog lists blockers ("42 / 30 customers") and refuses to swap. The `UpgradePromptModal` is also triggered inline whenever a form sheet hits a `TierLimitError`. The "Subscription" entry in the admin menu ([admin/index.tsx](<../SubsTrack/app/(app)/(tabs)/admin/index.tsx>)) is rendered only for tenant-wide admins (`user.branchId === null`) — branch-scoped admins don't see it.

**`UpgradePromptModal` design:** for tenant-wide admins, the modal renders compact preview cards for the available upgrade tiers (every tier with `sortOrder > currentTier.sortOrder`), each showing name, monthly price, and a few key perks (customer/user caps, multi-month/multi-currency flags). The footer has "Not now" + "View plans"; "View plans" pushes `/(app)/(tabs)/admin/subscription`. Branch-scoped admins and staff see a stripped-down "Limit reached — contact your administrator" notice with just a Close button (they can't change the tier themselves).

**Soft UX gates** beyond the hard service-layer block: PlanFormSheet hides multi-month duration UI when `tier.multiMonthPlansEnabled === false`; CurrencyFormSheet hides itself behind the same `assertMultiCurrency` check; the Add buttons on list screens stay enabled so the user always reaches an explanation.

**Tenant creation defaults to Free.** Both the public `create-tenant` edge function and SuperAdmin's `TenantService.createTenant` look up the Free tier id and stamp it on the new `tenants` row. SuperAdmin's `TenantFormSheet` exposes a tier dropdown so the SaaS owner can onboard paid tenants directly or change a tenant's tier later (the manual paid-upgrade path). `tier_upgraded_at` is touched on every change.

**Future-proofing:** to add Stripe, append nullable `stripe_price_id_monthly` / `stripe_price_id_yearly` to `tier_plans` and `stripe_customer_id` / `stripe_subscription_id` to `tenants`. Only `subscriptionSlice.upgrade()` changes — it redirects to a Checkout session, the webhook updates `tier_id`. Every other call site already reads from `currentTier`.

---

## Products & One-Off Sales

`products` + `services` + `sales` extend SubsTrack beyond recurring subscriptions. `payments` (subscriptions) and `sales` are deliberately separate ledgers — they don't share schema or service code. Subscription month-grid logic is untouched.

**Products** mirror `plans` exactly: per-tenant catalog, optional currency, `branch_id IS NULL` = SHARED, soft-delete via `active = false` when a product has historical sales (hard-delete otherwise — mirrors `CurrencyService.deleteCurrency`). Tier-gated through `tier_plans.max_products` (Free: 5, Pro/Business: unlimited). Soft-vs-hard delete keys off **`sale_items.product_id`** references (not `sales`).

**A sale is a header + lines, and a line sells a product OR a service.** One sale can hold **several lines** in any mix (a small "cart") — products only, services only, or both, but at least one of something. The account/transaction lives on the `sales` header; each thing sold is a `sale_items` row. This mirrors the `customers` → `customer_plans` header/line split. See **Services** below for what a service line is and is not.

- **`sales` (header)** — one transaction: `items_summary`, `total_amount`, `currency_id` + `rate_per_usd_snapshot`, `customer_id`, `recorded_by_user_id`, `sold_at`, void fields. It holds **no money and no custody**: what the sale OWES is its `charges` row (`kind = 'sale'`, written in the same transaction) and what was COLLECTED is a `collections` row — which is what lets one sale take installments. `Sale.amountPaid` still exists in the domain type but is **derived**, filled by `SaleService.withMoney` from the bill's balance.
  - `items_summary` — a **frozen** human summary of every line (e.g. `"Water ×2, Installation"`), built by the service at create time. It powers the Sales-tab **search** and the **list / debt / wallet labels** so those stay lean (no `sale_items` join needed). Contains every line's name — products and services alike — so search matches any of them.
  - `total_amount` — the summed line totals, **app-written** at create (a generated column can't sum a child table). Snapshot, never recomputed. It is also the amount of the sale's bill, so anything still owed on it is one "sale" debt for the whole sale.
  - `rate_per_usd_snapshot` — currency rate at sale time, same drift-free principle as `payments.rate_per_usd_snapshot`. Use `paymentSnapshotCurrency(sale, currencies)` to display — it works for any row with `currencyId` + `ratePerUsdSnapshot` despite the name.
  - `customer_id` is **nullable** — walk-in sales are recorded with `customer_id = NULL`.
  - `voided_at` / `voided_by` / `void_reason` for soft-void. Voiding cascades to `sale_items` only on hard delete (FK `ON DELETE CASCADE`); a void just stamps the header. No hard delete of active sales.
- **`sale_items` (lines)** — one row per thing sold: `sale_id`, `line_type` (`'product'` | `'service'`), nullable `product_id` / `service_id`, `item_name_snapshot` (frozen), `quantity` (**always 1 on a service line** — labour has nothing to count; see Services below), `unit_amount` (frozen, in the sale currency), `voided_at` (set only when an **edit** dropped the line — see below). `line_total = unit_amount * quantity` is **derived in the mapper** (no stored column). No own `branch_id` — RLS inherits from the parent sale (`EXISTS`), like `payments` inherit via the customer. `ON DELETE CASCADE` from `sales`; `ON DELETE RESTRICT` on **both** `product_id` and `service_id` (a referenced catalog row can't be hard-deleted — including by a line an edit dropped, which is why both reference counts deliberately count voided lines too). `chk_sale_items_line_ref` keeps the type and the ids agreeing: a `'product'` line has a product and no service; a `'service'` line has no product, and **may** have no service either — that gap is the one-off typed job.
  - The name column was `product_name_snapshot` before a line could be a service. The rename is guarded inside `script.sql` and needs a matching local backfill, because the SQLite mirror is additive-only — see gotcha #99 before renaming anything else it mirrors.

**One currency per sale, auto-convert.** A sale freezes exactly one currency + one rate (the debt / wallet / dashboard math depends on it). The `SaleFormSheet` has a single sale-currency selector; when a catalog item (product **or** service) is added, its price is **converted into the sale currency** at the live rate (`convert()` in `src/core/utils/currency.ts`) as the editable per-line prefill. The first catalog item picked adopts its own currency as the sale default (until the user changes it); changing the sale currency re-prices every catalog line from its own price — a **one-off** service has no catalog price, so its typed amount is left alone. The `SaleItemsEditor` (`src/modules/transaction/sales/components/`) owns the cart rows + sale currency and reports a `SaleCartDraft` (`lines` / `total` / `currency` / `ready` / `dirty`) up to the form — mirroring `CustomerPlansEditor`'s add/remove-row pattern. An optional `initial` seeds it from a saved sale (edit mode). It answers `dirty` **itself** rather than letting the form diff its values: it re-reports the draft from an effect one render after mount, so `useDirtyForm`'s baseline would be the empty cart and an untouched edit form would prompt "discard changes?" on close (gotcha #55). The editor owns the baseline, so it owns the answer — and its signature covers `lineType` / `serviceId` / the typed name too, or flipping a row to a service would read as untouched.

**Create is header-then-lines.** `SaleService.createSale` computes the summed `total_amount` + `items_summary`, then `SaleRepository.create` inserts the header, then the lines (web: sequential insert like the customer + `customer_plans` path; offline: header + all lines in one SQLite transaction, pushed parents-before-children via `PUSH_WAVES`). List/detail reads join `sale_items(*, products(*), services(*))` — both LEFT joins, since a line fills at most one of them; the lean aggregate/label reads (`partialSales`, `heldForWallet`, dashboard totals) read only header columns.

### Services

A **service** is labour the tenant charges for — an installation, a repair visit, a router setup. Before this existed the only way to bill for one was to invent a fake product, which dragged it through the stock ledger and the derived stock expenses where it does not belong.

**What a service is:** a **line on a sale**. There is no service record, no Services tab, and no fourth money stream. That is the design, not a shortcut: every money figure in the app reads the sale's **one bill**, so services arrived in revenue, debts, the collector wallet, Reports, WhatsApp invoices and the CSV export with **no new aggregation anywhere**. Read gotcha #98 before adding a "services revenue" figure — a mixed sale raises one charge, and splitting the cash against it between goods and labour is a number the business never agreed to.

**What a service is NOT:** stocked or costed. No `stock_movements` row, no oversell check, no expense. Staff pay is still typed by hand under the `salaries` expense category. Because a service line moves no stock, every stock path narrows through `productLines()` / `savedProductLines()` in `sales/utils/saleLines.ts` — never a nullable-id test (gotcha #97).

**The price list (`services`).** Admin → Services, reached from the admin menu. The products screen minus stock and cost: name, description, price + currency, branch (`branch_id IS NULL` = SHARED), `active`. `UNIQUE(tenant_id, branch_id, name)` and the RLS pair `services_select` / `services_modify` are copied from `products` verbatim — so a **collector** can add one from the sale form the same way they can add a product, and a branch-scoped user can only write in their own branch. **No tier limit** (unlike `max_products`): services are uncapped. Soft-delete when any sale line references it (counting voided lines, since the FK is `ON DELETE RESTRICT`), hard-delete otherwise — the same two-mode `deleteService` as products, with a batch counterpart. Audited like products, with **History** on the card menu via `useRecordHistoryAction('services')`.

Layers: `src/modules/admin/service-catalog/` — repository (+ `.offline`, platform switch), `ServiceCatalogService`, `ServiceListScreen`, `ServiceCard`, `ServiceFormSheet`, and a `services` slice with the standard `loaded` guard. The business-logic class is named `ServiceCatalogService`, not `ServiceService`, because "service" is also this app's name for that whole layer — and the module folder is `service-catalog` so the file is not `admin/services/services/…`.

**Picking one on a sale.** A line's kind is decided by **which button added it** — the cart footer holds two dashed buttons, **+ Add product** and **+ Add service** — and the card then only *labels* what it sells (icon + word, plus `#n` when there are several). There is **no per-row switch**: the first shape of this editor put a full-width `Product | Service` segmented control at the top of each card, which read as a page tab bar, so tapping "Service" looked like navigating to a services list and instead silently wiped the product the user had just picked (gotcha #101). A sale holding both is therefore **two lines, never one line toggled twice**, which is also what the data model always said. A new sale opens with **zero** rows — the two buttons are the empty state — and any row, including the last, can be removed, which is how a line's kind is changed. In a service row the dropdown offers the active catalog services (priced in the sale currency, same conversion as products) plus a final **"Other — type a name"** option, which reveals a name field: that is the **one-off** — `service_id IS NULL`, and `item_name_snapshot` is the entire record of what was sold, so no catalog row is created. Adding a service inline (the dropdown's "+") prices the row from the object the form just saved, not from a store lookup, which would miss it on that render.

**A service line has NO quantity — only a price.** No stock cap, no "N left" caption, and **no stepper at all**: labour is one job at one price, so the row shows a single **Price** field which *is* the line total. Two jobs are two lines; a bigger job is a bigger number. This is enforced by the type, not by a runtime check — the `service` variant of `CreateSaleItemInput` simply has no `quantity` field, so the compiler stops any caller from multiplying one. `lineQuantity()` (`sales/utils/saleLines.ts`) is the one answer to "how many?", returning 1 for labour, and every total, summary and DB row goes through it: `sale_items.quantity` still exists and still stores **1** on a service line, so nothing downstream had to learn a special case. The receipt and the WhatsApp invoice both drop the `1 × …` prefix on a service line, because "1 × $25 = $25" is noise.

**Validation** splits by kind in `SaleService.validate`: a product line needs a real catalog row (`errors.sale_product_required`) **and** a positive integer quantity, a service line needs a non-blank resolved name (`errors.sale_service_required`) — which is also what keeps the `NOT NULL` name column legal for a one-off — and no quantity rule at all. The positive `unit_amount` check is shared.

**Edit an existing sale.** A recorded sale can be corrected in place — "I rang up the wrong product / quantity / price" no longer means void + re-record, which lost the receipt id and left a dead row in the trail. **Any staff member** may edit, from the sale row's **3-dot menu** or the receipt sheet's **Edit sale** action (all three sale surfaces: the Sales tab, the customer panel, the per-customer page). It reuses **one form** — `SaleFormSheet` takes an optional `sale` prop and switches title, button and submit path; there is no second edit form. A **voided** sale is a closed record and never offers the action (`SaleService.updateSale` refuses it, and both repositories filter `voided_at IS NULL`).

Everything the form owns can change: the lines (including swapping a product line for a service one, or the reverse), quantities, unit prices, the sale currency, the customer, the amount collected and the notes. What identifies the sale cannot: `id`, `tenant_id`, `sold_at`, and the original `recorded_by_user_id` (who made the correction is in the audit trail, not on the row). Five rules make it safe:

- **Changing the currency RE-FREEZES `rate_per_usd_snapshot`**, exactly like editing a payment (gotcha #21) — the corrected row is what every historical USD total then reports.
- **The stock ledger is swapped, not reversed.** `SaleRepository.update` soft-voids the sale's live `'sale'` movements and inserts fresh ones — the same idempotent shape as `voidSale`, never compensating opposite rows (gotcha #48). It only happens when the **per-product** unit count actually changed: `SaleService.sameStockFootprint` compares the carts by product, so a price / notes / amount-paid fix leaves the ledger untouched (and splitting one line of 3 into 1 + 2 moves nothing, so it doesn't either). **Service lines are invisible to that comparison on both sides**, so a service-only edit compares two empty footprints and correctly leaves the ledger alone; replacing the last product line with a service yields an empty replacement set, which voids the old movements and inserts none — giving the stock back exactly once (gotcha #97).
- **The sale's own units count as available while it is being re-cut.** `assertStockAvailable` takes a `credited` map (and `SaleItemsEditor` a matching stock credit), so re-pricing a sale that took the last unit isn't rejected as out of stock, and the cart's "N left" caption shows the true ceiling. The editor also keeps a product that was **deactivated** since the sale on its line — otherwise the edit couldn't re-save the line it is standing on — while barring it from a new one.
- **A dropped line is soft-voided (`voided_at`), never deleted.** The sync engine has no tombstones for `sale_items`, so a delete would live on forever in every other device's mirror. Lines are matched to the existing rows **by position**, so a line that merely changed quantity or price keeps its id and syncs as a plain update. `mapDbSaleToSale` filters voided lines out — the one place both the web and the offline read pass through — and the Sales-tab product filter skips them too.
- **A walk-in edit keeps the sale's branch.** The create rule (`customer.branchId ?? user.branchId`) would move a collector's branch sale to "no branch" the moment a tenant-wide admin corrected a typo in it, so an edit falls back to `sale.branchId` instead.

An edit **re-prices the bill and leaves every payment against it alone** — money is a `collections` row with its own date, collector and custody, so correcting it means voiding that payment, not re-typing a number here. The form shows the collected amount read-only and refuses a total below it (`errors.sale_total_below_collected`); the service refuses it too. There is **no custody lock** — a sale stays editable after its cash has been handed up the chain. One audit entry is written for the sale as a whole (`action: 'update'`, changed columns only) — `sale_items` and `stock_movements` remain deliberately un-audited, and the changed `items_summary` / `total_amount` are what report a re-cut cart.

**Receipt (`SaleDetailSheet`).** The lines get their **own card**, separate from the customer / sold-at / receipt-ID rows: an "Items" header (cart icon + line count when >1), then one row per line — numbered bubble, `item_name_snapshot` (a **service** line prefixed with a small `construct-outline` mark, so the bill shows at a glance which part was labour), a `qty × unit price` sub-line, and the line total on the right. A totals footer (Total, plus Paid / Remaining when the sale is partial) renders only when it adds information (multi-line or partial sale). The hero's caption swaps the frozen `items_summary` for a "{{count}} items" count once there is more than one line, since the summary gets long. Lean reads (empty `items`) simply skip the card.

**Row actions (`useSaleActions`).** Every sale row carries a **3-dot menu** holding everything one sale can do, so no action is reachable only by opening the receipt first: **View receipt · Edit sale · Complete · Send invoice on WhatsApp · History · Void sale**. A **voided** sale keeps only the two that still make sense (view + history) — void is final, so it is never editable, re-sendable or voidable again. The WhatsApp row stays **visible and disabled with a caption** when there is nobody to send to (walk-in) or no phone on the customer, the same "explain, don't vanish" rule the invoice selection action follows.

**Collect** appears only while the sale still owes something and has a customer (a walk-in has nobody to chase). It opens the very same `CollectSheet` every other bill uses — one door for money in, so custody, the audit entry and the currency rules are written in exactly one place. The old **Complete** action is gone with the model that needed it: `amount_paid` had no date of its own, so "he really paid in full, it was written down short" could only be expressed by rewriting the number. Now the second payment is simply recorded, on the day it happened. The hook takes an `onCollected` callback carrying the created `Collection`, and the sale form's `onCreated` / `onUpdated` carry the saved `Sale` — a list that keeps its own state (the two customer-scoped ones) patches itself from the row. The Sales tab needs neither: `ledger.collect` fans the hand-over out to `sales.applyCollection`, and the slice patches its own list and month totals on every write (gotcha #116).

The whole set is defined **once**, in `sales/hooks/useSaleActions.tsx`, and used by all three sale surfaces (Sales tab, customer panel, per-customer page) — adding an action means one edit, not three. The hook owns the `ActionMenu`, the shared-reason void dialog and the record-history sheet; the screens keep the receipt sheet and the sale form, since those carry each screen's own refresh callback. Two deliberate choices inside it:

- **One menu per SCREEN, not per card.** The debts / expenses cards each mount their own `ActionMenu`, but the sales lists are paginated and virtualized, so a per-card menu would mount a bottom sheet per visible row. `SaleCard` only raises `onMenu(sale)`.
- **One void dialog for one sale and for a selection.** `requestVoid(sales)` feeds the same `SaleBulkVoidSheet` from the card menu and from the multi-select toolbar, so a single-sale void gets the same reason box and the same `voidSales` path (its title/message have `_one` plural forms so the copy reads right for one row).

**Branch semantics:**

- `products.branch_id`: same as `plans` — `NULL` = SHARED catalog item visible to every branch.
- `sales.branch_id`: same as `customers` — `NULL` only when a tenant-wide admin records a walk-in without picking a branch. RLS scopes branch-scoped users to their own branch. `sale_items` has no `branch_id` — it inherits via the parent sale.

**`AsyncEntityPicker`** ([src/shared/components/AsyncEntityPicker.tsx](../SubsTrack/src/shared/components/AsyncEntityPicker.tsx)) is the reusable customer picker built for `SaleFormSheet`. Generic over `<T>`; the caller passes a `loadPage(search, page)` callback. Reuses `SearchTextBox`, `useDebounce` (300 ms), and a `requestToken` ref to discard stale responses when the user types fast (same pattern as `customerSlice.searchToken`). Use it any time the option list is too large to fit in memory — small static lists keep using `Dropdown`.

**Sales tab filters:** `SalesPanel` exposes a chip filter bar above the list — search (sale `items_summary` + customer name), customer (`CustomerPicker`), product (`Dropdown` over active products, lazy-loaded via `fetchProducts` on mount — the repo resolves "sales containing this product" from `sale_items`), and a **From/To date range** (`DatePickerInput` with `triggerStyle="chip"`, the two pickers constrain each other via `minDate`/`maxDate`). All non-search filters live on the `sales` slice (`customerFilter`, `productFilter`, `fromDate`, `toDate`) and flow into `saleService.getSales` → `SaleRepository.findAll`; date bounds are calendar days converted to `sold_at` timestamp bounds (end inclusive via next-day-exclusive). A "Clear filters" chip (visible only when ≥1 filter is active) resets them in one tap via `clearFilters`.

**Customer sales surfaces:** the customer detail screen renders `CustomerSalesPanel` at the **bottom** (below the payment grid + details card). The panel shows only a **5-sale preview**; when the customer has more it renders a "Show all" link to a dedicated full-page list (`CustomerSalesListScreen` at `customers/[id]/sales`) that mirrors the Sales tab (search + infinite scroll + record FAB + void) but is locked to one customer. Both surfaces keep their **list reads** independent of the global `sales` slice — the panel via `saleService.getSalesForCustomer` (with a stale-response token guard), the full page via the `useCustomerSalesList` hook — so neither clobbers the Sales tab's filter/search/list state. **Mutations, however, route through the global slice** so the Sales tab cache stays coherent: creates go through `SaleFormSheet` → `saleSlice.createSale` (unshift), and voids go through `saleSlice.voidSale` (drops the row from `sales.items`); each surface then refreshes its own local list. Neither surface applies a branch filter: they show **all** of the customer's sales regardless of the admin's current branch view.

Both customer surfaces also carry **multi-select → one WhatsApp receipt** (`useSaleInvoiceAction`): long-press a card to enter selection, tap to tick, and the send action builds a single receipt for the whole selection. The full page uses the page-header `SelectionBar` (with select-all); the **preview panel** swaps its own title row for an `InlineSelectionToolbar` with **no select-all** — five rows don't need one — inside a fixed-height (`h-9`) wrapper so entering selection can't shift the cards under the finger that long-pressed one, and it hides "Show all" while selecting. Its selection is cleared by every `refresh()`, because a new sale can push a ticked row out of the 5-row preview. Bulk **void** stays on the full page and the Sales tab only.

**Dashboard:** `DashboardService.getMetrics()` makes **one** cash read — `collectionService.collectedInRange` — plus a plain `saleService.countInRange` for the activity count. The Revenue card shows `monthlyRevenue = subscriptionRevenue + salesRevenue + manualRevenue`, with a breakdown sub-line listing only the non-zero streams. All three come from the SAME rows, split by what each one settled (`charges.kind`), so unlike the old three-query version **they add up to the total exactly**. Everything is summed in USD via each row's frozen `rate_per_usd_snapshot`, then formatted into the display currency at render.

**Revenue is CASH COLLECTED, not billed value** — and now there is only one place it can come from: `collection_items`, by `collections.received_at`. A partial payment contributes only what arrived; the remainder is a debt and enters revenue in the month it is collected, so every unit of money is counted exactly once and nothing collected is lost. Reading from the **item** side is what fixed the old breakdown: a payment against a sale debt used to land in a "debts" bucket, so sales revenue under-reported. `salesCount` is still every sale row, paid or not (`SaleRepository.countInRange`) — only the money is cash-based. Do **not** switch any revenue query back to `sales.total_amount` or `charges.amount`.

**Home analytics (expanded).** `getMetrics()` also computes a richer analytics set, all branch-scoped and USD-canonical:

- **Month-over-month** — `prevMonthRevenue`, the dashboard's only comparison figure (there is **no revenue chart**: it was removed along with `RevenuePoint`, `getRevenueTrend` and the slice's `trend` state). The hero card renders a ▲/▼ % pill ("vs last month") when the prior month had revenue. Built by `DashboardService.getMonthCollections(year, month, branchFilter)` — one private helper that returns a month's collected cash split by what it settled (plus `paymentsCollectedCount` / `salesCount`), and the **only** place the revenue query is issued: `getMetrics()` calls it twice inside its own `Promise.all` (this month for the breakdown, `month - 1` for the pill), so both figures come from the **same read**, scoped by **when the money arrived** (`collections.received_at`, never `billing_month`) — the pill compares like with like by construction, not by two code paths agreeing. `Date` normalizes month 0 into last December, so January needs no special case.
- **Growth this month** — `newCustomersThisMonth` / `cancelledThisMonth` via `customer.countCreatedInRange` / `countCancelledInRange` (by `created_at` / `cancelled_at`, `[monthStart, monthEndExclusive)`).
- **Activity this month** — `paymentsCollectedCount` (positive-amount rows in `paidAmountsForMonth`, scoped by `paid_at`) and `salesCount` (`totalsForMonth` row count). The screen derives **avg payment** = `subscriptionRevenue / paymentsCollectedCount`, shown as the "Payments" tile sub-line.
- **Total debt tile** — the one figure on the dashboard that is **all-time, not month-scoped** (it answers "how much is still outside", which has no month). `totalDebt` comes straight from `ledgerService.getDebtsView().summary.totalUsd` — the same number as the Debts screen header. Its sub-line breaks it down by kind (`monthsDebt` / `salesDebt` / `manualDebt`), and **these now sum to the headline exactly**: every row carries its own balance, so there is no gross-vs-net split left to explain. The old mismatch (and the reverted attempt to reconcile it) died with `debt_payments`.
  - `totalDebt` **also appears inside the purple hero card** as a red-tinted chip (`bg-red-400/20`, matching the card's decline pill) prefixed with a minus — `Owed by customers −$383.00` — shown only when `totalDebt > 0`. It sits below the revenue breakdown, sharing a wrapping row with the orange `Expenses $X` chip. **Only the red chip carries a minus** — spending prints unsigned, the same way `outflowLabel()` prints it on the Expenses tab, so the two screens never disagree about the sign of a cost. The tint + minus are load-bearing: everything else in that card is money **collected**, so the one figure that is money **not** collected has to read as an outflow at a glance. The tile below keeps the reconciling category breakdown; the chip is the glance-value.
  - The hero's revenue breakdown lists **Subscriptions and Sales** (and hand-typed fees when there are any). The old "hide collected debts from the breakdown" rule is obsolete: money is now filed under **what it paid for**, so cash that settled a sale debt appears under Sales — where the owner would look for it — instead of in a second debt figure beside the one that says what is still owed.
  - So the card carries **money in** (big number + streams) and **money out** (the chips) together, and they never mix: collecting a debt raises the total and lowers the red chip.

**The hero card is its own component** — `dashboard/components/RevenueHeroCard.tsx`. It owns every figure printed on the purple card and derives them itself (the month label, the ▲/▼ pill, the revenue mix, the two outflow chips, the collection bar), so the screen hands it only `metrics`, `fmt`, `showExpenses` (admin **and** something was spent — the same flag that reveals the two money-out tiles below) and an `onPress`. **Tapping the card opens the Reports tab**, and a "Reports ›" pill in its top-right says so; both the dashboard and Reports are admin-only tabs, so anyone who can see the card can open it. Without `onPress` the card renders as a plain `View` — no pill, no press feedback. Layout is flat panels rather than divider rules: the revenue mix and the Net row each sit in a `bg-white/10` inset (the old `bg-indigo-500` dividers were invisible, since `bg-primary` **is** indigo-500).

Presentation: the screen uses a shared `StatTile` (label / big value / sub-line / tone / optional icon) for the stat grid (Active, Unpaid, New, Cancelled, Payments, Sales) and the total-debt money tile. Every repo range query has a Supabase + Offline SQLite implementation behind the `ICollectionRepository` / `IChargeRepository` / `ISaleRepository` / `ICustomerRepository` seam.

**Tier-gating** is sale-blind: products consume a slot (gated by `max_products`), but recording sales is unlimited on every tier. Stock is not gated at all — restocking is unlimited.

### Stock

Every product carries a stock quantity and can be **out of stock**. Stock on hand is **computed at runtime** — `Product.stockOnHand = SUM(stock_movements.quantity_delta)` over the non-voided rows — exactly like Debts and the Collector Wallet. There is deliberately **no counter column on `products`**: the offline sync pushes whole rows with latest-`updated_at`-wins, so two devices each selling one unit offline would both write the same decremented number and one sale would vanish. Additive ledger rows merge with no conflict.

**`stock_movements`** — `product_id`, signed `quantity_delta` (never 0), `reason`, `sale_id` (only for `'sale'`), `unit_cost` + `currency_id` + `rate_per_usd_snapshot` (what the stock cost to BUY — see below), `note`, `recorded_by_user_id`, `occurred_at`, plus soft-void fields. Reasons:

| Reason | Written by | Sign |
| --- | --- | --- |
| `initial` | the "Starting stock" field on **product create** | + |
| `restock` | the product's stock sheet, "Add" — or the **batch restock** sheet | + |
| `adjustment` | the product's stock sheet, "Remove" (damage, miscount, wrong entry) | − |
| `sale` | `SaleService.createSale`, one row per line | − |

**Reading it.** Web reads the `product_stock` view — `SUM(quantity_delta) … WHERE voided_at IS NULL GROUP BY product_id, tenant_id`, declared `WITH (security_invoker = true)` so the caller's RLS on `stock_movements` still applies (**requires PG 15+**; without `security_invoker` the view runs as its owner and leaks every tenant's stock). Offline runs the same `GROUP BY` on the mirror — there is no local view. Both are `IProductRepository.stockOnHand(ids?)` returning `Record<productId, number>`; products with no movements are absent and default to 0. `ProductService.getProducts` folds the map into each `Product`.

**Branch scoping is inherited from the PRODUCT, not the sale.** The `stock_movements_all` policy mirrors `products_select` (`current_branch_id() IS NULL OR p.branch_id IS NULL OR p.branch_id = current_branch_id()`) — **not** `sale_items_all`, which inherits `sales`' *owned* semantics. Copying `sale_items_all` would hide every SHARED product's movements from a branch-scoped user, so each shared product would read as permanently out of stock and be unsellable for them. A shared product has **one** stock pool across all branches. The `WITH CHECK` also allows shared products (unlike `products_modify`): a branch user who can *sell* a shared item must be able to write its movement.

**Writing it.**

- **Sale create** — `SaleService.createSale` builds one negative `'sale'` movement per line and passes them in `CreateSalePayload.movements`. The repository writes them alongside the header + lines (offline: the *same* transaction), so a sale can never exist without the stock it consumed.
- **Sale void** — the sale's movements are **soft-voided** (`UPDATE … WHERE sale_id = ? AND voided_at IS NULL`), not reversed with opposite rows. One statement, independent of line count, and idempotent — a repeat void is a no-op instead of returning the stock twice. Bulk void inherits this for free (`saleSlice.voidSales` loops `saleService.voidSale`).
- **Manual** — `ProductService.addStock` appends a single `restock` row. **A manual entry only ever ADDS** — there is no "remove from stock" form: a delivery that was mistyped, never arrived, or was logged twice is fixed on the entry that recorded it (see [Editing a stock entry](#editing-a-stock-entry) and [Reverting a stock entry](#reverting-a-stock-entry)). A row is never deleted, and a `'sale'` row is never touched by hand.
- **Batch restock** — `ProductService.restockMany(entries, tenantId, note, userId)` appends one `restock` row **per product** in a single `addMovements` call (offline: one transaction), then returns the fresh on-hand map so `productSlice.batchRestock` updates the list without a refetch. One arriving delivery = one save, but the per-product history stays exactly as detailed as the one-at-a-time path — there is no "batch" reason and no grouping row. The shared note is copied onto every row.

**Blocking.** `SaleService.createSale` calls `assertStockAvailable` after `validate()` — a **fresh** `stockOnHand` read (the store can be minutes stale), summing the requested quantity **per product across all cart lines** (the same product can sit on two rows). Throws `errors.sale_out_of_stock` / `errors.sale_insufficient_stock`. Because it lives in the service, every entry point is covered (sale form, quick actions, customer screens). `SaleItemsEditor` mirrors it as a soft guard: out-of-stock products stay listed but greyed via `DropdownOption.disabled`, the quantity stepper caps at *on-hand minus what other rows already took*, each row shows "N left", and an oversold cart reports `ready: false`. The check is **advisory** — two offline devices can still each sell the last unit, and the DB deliberately allows a negative total (gotcha #48).

**UI.** `ProductCard` shows a green "N in stock" / red "Out of stock" / red "Short by N" chip. `ProductStockSheet` (product row menu → "Adjust Stock", or the link on the edit form) shows the current on-hand, a quantity + cost + note that only ever adds, and the last 20 movements as a bordered list: a reason icon tinted by direction (green adds / red removes), the reason, date **and** time (`formatDateTime`), who recorded it (resolved from the users slice via `recordedByUserId`), the note, a **3-dot menu** on every correctable row (Edit entry · History), and a "Reversed" chip with struck-through amount on voided rows. An amber line warns when the save would push stock **below zero** — it never blocks, because the DB accepts a negative total on purpose (gotcha #48). `ProductFormSheet` takes "Starting stock" on **create only**; on edit it renders the number read-only next to an "Adjust Stock" link, so the total is never free-typed.

`ProductBatchRestockSheet` is the many-products counterpart: a search box, then every **active** product as one compact row — name, current on-hand, and a `[−] qty [+]` stepper. A row with a quantity turns indigo and previews the result (`3 → 8`), so what's included is visible without reordering the list while the user types. One shared note applies to every row, and a summary line ("N products selected · +40") sits above the save button. Quantities are held per product id, so filtering the list never loses what was already typed. Two entry points, one component: the **Restock** button beside the search box on the products screen, and **Batch Restock** in the PageHeader quick-actions menu (admin-only there, since products live in the admin tab that non-admins never see).

**Cost — the money side of the ledger.** A movement can carry what one unit cost to buy: `unit_cost` + `currency_id` + `rate_per_usd_snapshot`, written together by `ProductService.movement()` or all three null. That is the **only** money on `stock_movements`, and it is what makes buying stock an expense (see [Expenses](#expenses)). `products` also gained `cost_price` + `cost_currency_id` — a *default* that pre-fills the restock forms, live like `price` and never frozen; each delivery freezes its own cost on its own movement. Everything is optional: a restock with no cost still records the stock and simply adds no expense, which is also what every legacy row does. A `'sale'` movement never carries a cost (stock leaving is not money leaving) — `movement()` enforces that one.

**Cost is typed in three places:** the product form's **Cost price** field (the default, plus the opening stock's cost on create), the stock sheet's **Cost per unit** / **Total cost** pair (see below), and the **batch restock** sheet, where one **delivery currency** is picked for the whole save and each picked row opens a cost line seeded from its product's cost price, converted at the live rate (the `SaleItemsEditor` rule — changing the delivery currency re-prices every row). The stock history shows a costed row's money ("Cost: $X", or green "Money back: $X" on a negative row), so which rows moved Expenses is visible.

**A stock expense comes back down through the ENTRY, never through a second row.** `amount = quantity_delta × unit_cost`, so a *negative* costed row is a negative expense — a credit — but **no new one can be written**: the stock sheet has no Remove mode, so the two doors are **Edit entry** (the row says 12, the delivery was 10) and **Revert entry** (the row should never have existed). Both take the money off the **entry's own month**, which is what a mistyped delivery needs — correcting a July delivery in August drops July's expense and leaves August alone. The credit shape stays supported for the negative rows older data already holds, and for editing one of them; it is simply not something staff can create any more.

**What has no door any more:** stock that really left later — damaged, lost, stolen, or returned to the supplier. Those were the empty-cost and the costed *removal*, and both went with the Remove mode. The count now comes down only by selling, or by editing the entry that put the units there — which rewrites that entry's own month instead of recording a later event.

**Per unit or per delivery — both are typeable, and each fills the other.** A supplier invoice states one or the other ("4.50 each", "45 for the lot"), so the stock sheet puts **Cost per unit** and **Total cost** side by side: typing either one recomputes the other from the quantity (`total = unit × qty`, `unit = total ÷ qty`). Only **`unit_cost`** is ever saved — the total is a way of entering it, not a column — so the derived unit keeps **8 decimals** (what `stock_movements.unit_cost` stores): rounding 100 ÷ 3 to 33.33 would make the recorded expense 99.99 and disagree with the invoice that was typed. **The last field staff typed is the anchor**, so changing the quantity afterwards recomputes the *other* one and never overwrites what they entered — typed a 45 total, then fixed 10 units to 12, and the unit becomes 3.75 while the total stays 45. Everything else keeps the per-unit field as the source of truth: an abandoned edit and picking Edit on a row both reset the anchor to "unit". One currency for both — the picker sits on the per-unit input and the total is locked to it, since a movement stores one currency.

#### Editing a stock entry

A **manual** movement can be corrected in place — `ProductService.updateMovement` → `IProductRepository.updateMovement`, reached from the history row's 3-dot menu → **Edit entry**. It is one of the **two** doors into "the stock number is wrong"; the other is [Reverting a stock entry](#reverting-a-stock-entry):

| | **Edit the row** | **Revert the row** |
| --- | --- | --- |
| What happened | the entry was **written** wrong (12 typed for a 10-unit delivery, a cost of 0.50 the invoice says was 0.45) | the entry should **not exist** at all (logged against the wrong product, saved twice) |
| The history says | 10 arrived | the row stays, struck through and chipped "Reversed" |
| The month that moves | the entry's **own** month — July becomes $5.00 | the entry's **own** month — July's $6.00 goes away |

Both look backwards, and that is now the whole story: a manual entry cannot *remove* stock, so "12 arrived, then 2 went back" is a shape the ledger no longer writes (it did until this change — gotchas #94 / #96 keep the reasoning, and older data can still hold such a row).

**What may change, and what may not.** Only **quantity**, **cost + currency** and **note**. `occurred_at` is locked (it is what decides which month the money counts in — moving it is what the two-doors rule exists to avoid), and so are `reason`, `product_id` and the row's own identity. `UpdateStockMovementPayload` is the type that says so.

Four guards live in the **service**, so every future caller inherits them:

- a `'sale'` row is refused (`errors.stock_movement_sale_locked`) — `SaleService` swaps a sale's movements when the sale is edited, so a hand-edit would leave the sale saying 3 sold and the ledger saying 1;
- a **voided** row is refused — it is already dead;
- the quantity arrives as a **magnitude**, and the sign is taken from the existing row, so a correction can structurally never turn stock added into stock removed (that is a new event, not a fix);
- **oversell is not blocked**, only warned about in the sheet — editing a delivery of 12 down to 10 after 11 were sold lands on −1, and negative stock is legal by design (gotcha #48).

**The rate only re-freezes when the cost actually moved.** Changing the amount or the currency re-snapshots `rate_per_usd_snapshot` at the live rate (the payment/sale edit rule, gotchas #21 / #90); editing only the quantity keeps the old rate, or a 2-unit fix would silently re-value a months-old purchase at today's rate. `ProductService.costFields()` is the one place that builds the cost trio, shared with `movement()`.

**Editing is why `stock_movements` is now audited** — see [Audit Trail](#audit-trail). Nothing else would remember that the row once said 12: the ledger is the only record of a manual movement, and an in-place edit overwrites it. Only an **edit** or a **revert** writes an audit entry (the insert would just duplicate the stock history), the entry is filed under the parent **product's** branch and name (`auditedUpdate`'s new `audit` option — a movement owns neither), and the same trail is readable from the row's own **History** action.

**UI.** One form does both jobs, like `SaleFormSheet`: picking Edit fills the sheet's quantity / cost / note from the row, puts an "Editing this entry" banner above it (direction locked, with a Cancel ✕ and a one-line note on when an edit is the wrong tool), and turns the button into "Save Changes". The tapped row sits far below the form, so picking Edit also **scrolls the body back to the top** (`scrollBody.current?.(0)`, the handle `FormSheet` fills through its `scrollRef` prop — a ref and not a context, see gotcha #102) — otherwise the filled fields and the banner stay off-screen and the action looks like it did nothing. Saving **keeps the sheet open** and reloads the history — a correction is only believable next to the rows it fixed — and resets the form to its first-render state so the unsaved-changes guard stays quiet.

#### Reverting a stock entry

The edit door's sibling, for when the entry should never have existed at all — a delivery logged against the wrong product, a duplicate save, an adjustment somebody typed on the wrong row. Reached from the same 3-dot menu (**Revert entry**, red, last), behind a confirm dialog, and open to **any staff member** like the edit.

**It is a soft-void, not a row deletion.** `voided_at` + `voided_by` are set, and both derived numbers fix themselves: the row leaves the stock sum (`product_stock` / the mirror's `GROUP BY` count only live rows) and, if it carried a cost, it leaves Expenses. The row stays in the history, greyed out with the "Reversed" chip that a sale-voided movement already wears — hard-deleting it would take away the only answer to "where did the other 12 bottles go", and the ledger is deliberately a record of what staff did, not just of the current total (rule 7, no hard deletes).

**The month is the entry's own, exactly like an edit.** Reverting says the entry was never real, so the money comes off the month the entry belongs to: a July delivery reverted in August leaves August untouched and drops July's expense. There used to be an opposite door — a costed *removal*, which credited the month it was recorded in — but the stock sheet's Remove mode is gone, so only older data holds such a row (see [Stock](#stock) → cost, gotchas #94 / #96).

**Refused for the same rows an edit is refused for, in the SERVICE.** `ProductService.revertMovement` and `updateMovement` share one guard — `liveManualMovement(id)` — so a `'sale'` row (its movements belong to the sale, which swaps them itself) and an already-reverted row are turned away wherever they are called from, not merely hidden in the menu. `stock_movements.voidMovement` is the one write, audited as a **`void`** with the parent product's branch and name, so "who reverted this and when" is answerable — and the reverted row's menu keeps its **History** action for exactly that (Edit and Revert are gone; a `'sale'` row still opens no menu at all).

**UI.** The confirm dialog names the entry ("Stock added +12 will stop counting…") and says what happens to the totals. On success the sheet stays open and reloads the history, so the "Reversed" row is visible immediately, and a form still filled from that row is reset — otherwise Save Changes would sit there pointing at an entry that no longer counts.

See gotchas #35, #36, #37, #48, #88, #89, #94, #96.

---

## Reports

The Home dashboard answers one question — "how is **this month** going?" — with fixed tiles for one fixed period. The Reports tab answers "how is the business going, over any period I choose". It is a small number of curated sections, not a query builder: an ISP owner reads them, not a data analyst.

**Admin-only**, the same gate as Expenses and the dashboard — the tab is hidden with `href: isAdmin ? undefined : null`, so the route is not even in the tab bar for a collector.

### The page

`PageHeader` (with the branch chip and a CSV export button) → `PeriodPicker` → a `SegmentedTabs` section switcher → the section's cards. Phase 1 ships **Money** and **Debts**; Customers and Staff/Products are phase 2 and drop into the same shells.

**Period** (`src/core/utils/dateRange.ts`) is one primitive: `ReportPeriod { preset, fromDate, toDate }` with presets *This month · Last month · Last 3 / 6 / 12 months · This year · Custom*. Every preset is **whole calendar months** — it always ends on the last day of its final month — so its buckets and its comparison window are the same shape. `previousPeriod()` shifts a month-aligned period by whole months and anything custom by its own day count. The file also holds the app's `dayStartIso` / `nextDayStartIso` / `rangeFromDays` helpers, which four repositories and the expense slice used to carry privately.

### Money

| Block | What it shows |
| --- | --- |
| KPIs | Collected · Spent · Net · Margin, each with a ▲/▼ pill vs the previous period of the same length |
| Money in | Breakdown by stream, with an inline share bar |
| Money out | Breakdown by expense category (including the derived `stock` half) |
| Collected by currency | What was **physically** collected in each currency, each printed in its own currency with a `≈` display-currency value beside it |

### Debts

| Block | What it shows |
| --- | --- |
| KPIs | Still owed (**all time**) · Collected on debts (**this period**) · Customers owing · Behind on payments (**counted to today**, so this one does not move with the period) |
| Who owes the most | Top 10 debtors, each with how many months they are behind, tappable through to the customer |
| What is owed for | Gross by debt category (months / sales / custom) |

Only one figure here is period-scoped. See gotcha #91 — outstanding debt is all-time by design, and the two are labelled apart on purpose.

### How the data is built

Two arrays feed almost everything, and both come from code that already existed.

**Money out needs no new query at all**: `ExpenseService.getExpensesView` already returns `ExpenseItem[]` carrying date, amount, currency, frozen rate, branch, staff, category and product — with the derived stock half merged and the branch semantics of gotcha #88 applied.

**Money in** is three new reads, one per stream, all returning the same `CollectedRow` shape:

| Repository | Method |
| --- | --- |
| `ICollectionRepository` | `collectedInRange(startIso, endExclusiveIso, branchFilter)` — ONE read, one row per bill settled |
| `ISaleRepository` | `collectedInRange(…)` |

Each lives on the repository that owns its table (never a cross-table `ReportsRepository`, which would have to re-derive the branch scoping `BRANCH_SCOPES` already encodes), and each has a Supabase impl and an offline SQLite twin. `ReportsService` tags them with their `stream` and merges them into one `CashRow[]`.

Everything else — by stream, by category, by currency, the comparison, and every drill-down — is **pure client-side aggregation** in `reports/utils/aggregate.ts` (`sumByKey`, `topN`, `shareOfTotal`, `delta`). **One query per stream per window**, so a 12-month report costs the same round trips as a 1-month one.

Revenue is **cash collected**, exactly as on the dashboard, and from the same one read: `collection_items` by `collections.received_at`, each summed in USD via the collection's frozen `rate_per_usd_snapshot`. Reports and dashboard must reconcile to the cent for a single month — that is the acceptance test, and it is now hard to fail, because both call `CollectionService.collectedInRange`.

### Drill-down

Tapping a breakdown row or the debts card opens `RecordsSheet` with the records behind that number. It is always a **filter over rows already in memory** — never a second query — which is also what guarantees the rows add up to exactly the figure that was tapped.

### Export

The header's download button writes the section as CSV and hands it to the system share sheet (`expo-file-system` + `expo-sharing`); on web, where `expo-sharing` is a no-op, it falls back to a plain browser download. `src/shared/lib/csv.ts` does the RFC-4180 quoting and writes a UTF-8 BOM, so a customer name with a comma does not split a cell and Arabic opens correctly in Excel. The money sheet writes spending as **negative** rows, so its Amount column sums to the report's Net.

### Reusable pieces

A phase-2 report is a config object plus a data hook, because the presentation is already built: `ReportSection` (loading / error / empty / pull-to-refresh), `KpiRow`, `ReportCard`, `BreakdownList`, `RankedList`, `ComparisonPill`, `CurrencySplit` and `RecordsSheet`, with one palette in `reports/utils/reportColors.ts` so a stream keeps its colour on every card.

**There are no charts.** A charting library (`react-native-svg` + `react-native-gifted-charts`) was fitted and then taken back out — the numbers, the share bars and the drill-downs carry the reports on their own, and the library cost a native rebuild for decoration. Do not reintroduce one without a figure that genuinely cannot be read as a list.

Three things moved out of single-use homes on the way, and the reports then reuse them rather than re-writing: `StatTile` → `src/shared/components/`, the date-range helpers → `src/core/utils/dateRange.ts`, and the wallet's per-currency fold → `groupByCurrency` in `src/core/utils/currency.ts`.

### Release

This is **not** an OTA release. `expo-file-system` and `expo-sharing` (the CSV export) change the native fingerprint, so the installed build can never receive it — `npm run build-prod` plus a reinstall is required. The range reports scan `collections (tenant_id, received_at)`, which the ledger schema indexes. No table or column changes — the whole feature is read-only.

---

## Expenses

The app counted only money **in** — every hand-over summed into `monthlyRevenue`. Expenses are the other half, so the dashboard can answer "did I actually make money?". **Admin-only end to end** (RLS on the table, and the UI drops the segment, the quick action and the dashboard tiles for anyone else): rent and salaries are not staff business.

**Two sources, one view.** `ExpenseService.getExpensesView({ startIso, endExclusiveIso, branchFilter })` composes them into a uniform `ExpenseItem[]` + a USD `ExpenseSummary` — the same shape `LedgerService` uses (stored rows + a derived stream from another service):

| Source | Where it comes from |
| --- | --- |
| `manual` | Hand-typed rows in the `expenses` table (rent, salaries, fuel, …) |
| `stock` | **Derived** at read time from `stock_movements` — costed, non-voided, non-`'sale'` rows; `amount = quantity_delta × unit_cost`, so a costed **negative** row is a negative amount (money back) — older data only, since a manual entry can no longer remove stock |

**A restock never writes an expense row.** Deriving it means correcting the stock corrects the expense, with no second insert inside the offline restock transaction, no drift on a void, and no orphan when a hard-deleted product takes its ledger with it. The cost of that choice is that a derived row **cannot be voided** (`ExpenseItem.canVoid` is false; its 3-dot offers "Open product") — a wrong cost is fixed on the entry that carries it — **Edit entry** for a mistyped one, **Revert entry** for one that should never have existed — and both take the money off the month that entry belongs to (see [Stock](#stock) → cost, and gotchas #94 / #96). Row ids are prefixed (`exp:` / `stock:`) so the two sources can never collide.

**Credits print `+`, in green.** A negative amount is the one figure on this screen that is not money leaving, so `outflowLabel()` — used by the card, the total-spent headline and every month section total — flips the leading `−` to `+` over the absolute value. Without it a credit reads `−-$5.00`. Its label says what it is (`Water ×2 returned`) instead of `×-2`.

**Cash basis, exactly like revenue.** A purchase counts in the month it was **paid for**, never the month the goods sell — no FIFO, no cost layering, and unsold stock is inventory rather than a loss. Manual rows key off `incurred_at`, a **user-picked date** (last month's rent entered today belongs to last month), not `created_at`.

**`expenses` table** — `branch_id` (its **own**, `NULL` = a company-wide expense), `category` (free text at the DB level; the app owns the code list, so a new category needs no migration), `description`, `amount` + `currency_id` + `rate_per_usd_snapshot` (the standard frozen-rate trio), `recorded_by_user_id`, `incurred_at`, soft-void fields. **Void-only, no edit** — a typo is voided and re-entered, so the row is its own history and the table is deliberately **not audited** (the same call as the debt tables). No tier gating.

**Branch semantics: one rule, and it is `owned` on both halves.** `expenses.branch_id` is `owned`, and NULL means **the company bought it, no branch did** — so a company-wide expense shows in the **All branches** view only (the "Unassigned" chip reaches it on its own). The *derived* half follows the same rule via the parent **product**: `stock_movements: { kind: 'inherited', joinedTable: 'products' }`, deliberately narrower than the stock RLS policy. Both exist for the same reason — **branch views must sum to the tenant total**. Making either one `shared` puts head-office rent, or a shared product's delivery, into every branch's expenses at once, and two branch admins each read the same money as theirs. The RLS policy is wider than the app filter on purpose: visibility and aggregation are different questions. Gotcha #88.

**UI.** An **Expenses** segment in the Transactions hub (admin-only) plus an "Add expense" quick action. `ExpensesPanel` reads a **date window** (the current calendar month by default) rather than paginating, so section totals are always the local sum: a total-spent headline with a stock/other split, search + category + From/To chips, then a month-grouped `SectionList` via the shared `groupByMonth` / `MonthSectionHeader`. Every amount carries a leading `−`. `ExpenseFormSheet` is the `CustomDebtFormSheet` shape (category `Dropdown`, `CurrencyInput`, `DatePickerInput` capped at today, branch picker, description).

**Dashboard.** `DashboardMetrics` gains `monthlyExpenses` / `stockExpenses` / `customExpenses` / `netIncome`. **`monthlyRevenue` stays GROSS** — `netIncome` is the subtraction, so `prevMonthRevenue` and the vs-last-month pill keep their meaning. The hero card gains an orange `Expenses $X` chip (unsigned, like `outflowLabel()` on the Expenses tab) beside the red "Owed by customers −$X" one (orange vs red because they mean different things — money already spent vs money not yet collected) and a `Net this month` line, red when negative; two full-width tiles follow. Admin-only throughout: `getMetrics` reuses the wallet's `viewer` gate.

**Code map:** `src/modules/transaction/expenses/` (repository + service + `expenseCategories.ts` + panel/card/form), the `expenses` slice + `useExpenseSlice`, `stockCostsInRange` on `IProductRepository`. See gotchas #88, #89 and #94; QA [expenses.md](../QA/expenses.md).

---

## WhatsApp Invoices

Staff can send the customer a **plain-text receipt over WhatsApp** — at the moment the money is taken, or later from the saved record. It is a `wa.me` deep link end to end: no PDF, no printing, no new dependency, no DB change, no server work. Everything lives in the small `src/modules/invoicing/` module.

**The module (4 files).**

- `utils/invoiceText.ts` — **pure** builders, no React and no i18n singleton: `t` arrives inside an `InvoiceContext { t, orgName, locale, currencies, displayCurrencyId }` (the same "pass `t` in" pattern as `blockRangeLabel.ts`). Exports `buildPaymentInvoiceText(ctx, customerName, rows)`, `buildSaleInvoiceText(ctx, sale, customerName)` and `buildSalesInvoiceText(ctx, sales, customerName)` (which falls back to the single-sale layout for one row, so a lone sale always produces the same document). It is **not a Service** — it decides nothing, validates nothing, throws nothing. It lives in a module rather than `src/core/` only because it reuses `getBlockRangeLabel`, and Core may not import from a module.
- `utils/invoiceRecipient.ts` — pure: collapses the rows of a multi-row receipt to the ONE customer it can be sent to, or names why it can't (`mixed` / `no_customer` / `no_phone`). Callers map their own row type down to `InvoiceRecipientRow { customerId, customerName, phone }`.
- `hooks/useSendInvoice.ts` — the one place that turns a saved record into a message. Gathers the context from the stores (`useAuthSlice` tenant name, `useCurrencySlice`, `useDisplayCurrencyId`, `useLanguageStore`, `useTranslation`), calls `openWhatsApp`, and on a `false` result shows the `confirm({ hideCancel: true })` dialog. Returns `{ canSend, resolveRecipient, sendPaymentInvoice, sendSaleInvoice, sendSalesInvoice }`; `resolveRecipient` is the recipient util plus the dialog that explains a refusal.
- `components/SendOnWhatsAppButton.tsx` — the app's single green (`bg-[#25D366]` + `logo-whatsapp`) action row. Matches `Button`'s geometry but is its own component because `Button` takes no icon and no `className`. `ContactToUpgradeButton` was re-pointed at it, so that markup now exists once.

**Entry points.**

| Where | Action |
| --- | --- |
| `CollectSheet` | (via each surface's own send flag) the hand-over it writes is sent as one receipt |
| `SaleFormSheet` | a second, stacked button — **Save & send on WhatsApp**, using the `Sale` `createSale` already returns |
| Quick pay — month-cell menu (`CustomerPaymentPanel`) + customer-card menu (`CustomerListScreen`) | a **Pay & send on WhatsApp** row beside "Quick pay" |
| **Month-grid multi-select** (`InlineSelectionToolbar`) | a green WhatsApp action beside "Collect" — one receipt for the hand-over it writes |
| `BillSheet` / the money-in history row menu | **Send on WhatsApp**, to re-send a saved hand-over any time |
| `SaleDetailSheet` + the three sales lists | **Send invoice on WhatsApp** — one sale, or one receipt covering a selection |

Stacked, not side-by-side: `Button` takes no `className`, and the long label (and its Arabic form) truncates at half a phone width.

**Both busy states are one marker, not two flags.** Each form tracks `busyOn: "save" | "send" | null`, set **before** the write and cleared in a `finally`, so the spinner stays on the button the user actually pressed across both phases (the store write, then the awaited deep link). Consequently `canSubmit` / `submitDisabled` are **validity-only** — folding the slice's loading flag into them greys out *both* buttons, and a disabled `SendOnWhatsAppButton` shows no spinner at all.

**No phone → visible but disabled, with a caption.** `canSend` digit-strips exactly like `openWhatsApp`, so `"-"` or `"n/a"` disables rather than producing a broken link. The button caption is `invoice.no_phone`, or `invoice.no_customer` for a walk-in sale; the menu rows use `ActionMenuItem.caption` for the same hint. **A voided hand-over or sale never shows the button** — a cancelled receipt is not a receipt.

**A receipt is ONE hand-over, and that simplified the whole builder.** `buildCollectionInvoiceText` replaced the old multi-row payment builder, and three rules it needed simply stopped existing:

- **One currency**, because a collection is single-currency — so no "one Total per distinct currency" any more, just one amount.
- **One date**, because a hand-over happens once — so no "date each bullet when the rows weren't collected together".
- **One customer**, because a collection belongs to one — so no `resolveRecipient` refusing a mixed selection.

What is left is the split: a hand-over that settled one bill names it above the amount, and one that settled several lists them as bullets under **"This pays"**, oldest bill first. The old rules were all workarounds for receipts assembled out of unrelated rows; the model now produces the receipt directly.

**Message format** (owned entirely by `invoiceText.ts`): `*Org name*` bold header + a receipt title, then `Label: value` lines, list rows prefixed with a literal `•`, and an `invoice.thank_you` footer. Amounts are `formatMoney(v, source, source)` where `source = snapshotCurrency(row, currencies)` — the literal cash at the row's frozen rate — with a ` (≈ …)` display-currency suffix on the **one** headline amount only. The date uses `getDateLocale(language)`, which always returns `en-US`: `formatMoney` hardcodes Latin digits, so an `"ar"` date would mix numeral systems inside one message.

**A multi-plan or multi-month collection is naturally one message**, because it is naturally one row. `CustomerListScreen`'s "collect all due" groups a customer's lines **by currency** and writes one collection per group (a collection cannot mix currencies), so a customer billed in two currencies receives two receipts — which is correct: he handed over two piles of cash.

**Several sales still need the multi-row builder**, and `buildSalesInvoiceText` is unchanged: a sales-list selection is genuinely a set of unrelated records, so it keeps the oldest-first sort, the per-currency totals and `resolveRecipient`'s refusal of a mixed selection.

**Getting the created record back.** `ledger.collect` returns the created `Collection` (no new state field), which is all a receipt needs — the header, its split, and its id.

See gotchas #68, #69, #80. QA: [../QA/whatsapp-invoices.md](../QA/whatsapp-invoices.md).

---

## Transactions Hub

The bottom **Transactions** tab (`app/(app)/(tabs)/transactions`) is a hub hosting in-page segments via the shared `SegmentedTabs` control: **Debts** (default), **Sales**, and — for admins — **Expenses**. `TransactionsScreen` owns the page chrome (SafeAreaView + title + `BranchSelector` + segments); each segment is a self-contained **panel** that owns its own body (filters, list, sheets, multi-select) but not the chrome. The selection toolbar that used to live inside `PageHeader` was extracted into a shared `SelectionBar` so panels (which have no `PageHeader`) can render it; `PageHeader` re-uses `SelectionBar` and re-exports `SelectionAction` for back-compat. While a panel is in selection mode it **replaces its filter row** with the single `SelectionBar` (see the shared selection row below).

- **Debts** → `DebtsPanel` (see [The Ledger](#the-ledger-charges--collections) — `ledger` slice).
- **Sales** → `SalesPanel` (the former `SalesListScreen` body, behavior unchanged — `sales` slice).
- **Expenses** → `ExpensesPanel` (see [Expenses](#expenses) — `expenses` slice). **Admin-only**: the segment is dropped from the array entirely for a non-admin, matching the RLS on the table.

> **There is no Services segment.** It existed as a "coming soon" placeholder and was **removed** when services shipped, because a service turned out to be a **line on a sale** rather than its own record — so the Sales tab already lists every one of them, and the price list belongs at Admin → Services. See [Products & One-Off Sales → Services](#services).

> **The money-in history is a sheet, not a tab.** `CollectionsPanel` lives in a
> full-height bottom sheet (`CollectionsHistorySheet`) launched from the
> **PageHeader 3-dot quick-actions menu** ("Money received", first item) on any
> screen, riding the same `ui`-slice / `QuickActionSheets` seam as the other
> quick-add sheets. It is **one** list where there used to be two: a month, a
> sale and a custom fee are all settled by the same `collections` row, so the
> payments history and the debt-payments history had nothing left to keep apart.
>
> **Voided hand-overs STAY in the list, marked** — history is a record of what
> happened, so the read passes `includeVoided: true` and `voidCollections`
> **merges** the voided rows back into `items` instead of dropping them. Money
> never counts one: `monthlyTotals` excludes voided rows server-side, and the
> panel's own per-row sum returns 0 for them. The **month grid is untouched** —
> it keys off collected money, and a voided collection contributes none.

**Month-grouped lists.** Sales, Payments, and Debts all render as a `SectionList` grouped by calendar month, newest first — one section header per month ("This Month" for the current month, else "June 2026"). The two newest buckets break out ahead of the months: **Today** (`common.today`) and **This Week** (`common.this_week`, Monday-based week start, excluding today) — a row lands in exactly one bucket (today → this week → its month). The grouping is a pure view transform (`groupByMonth` in [monthSections.ts](../SubsTrack/src/shared/lib/monthSections.ts)) over the **already date-desc-sorted** slice data, so the slice/service stays the single source of sort order — it only buckets, it never re-sorts. Day/week bucket totals are always summed locally (their newest rows are guaranteed loaded); a month whose newest rows were peeled into Today/This-Week has that peeled USD subtracted from its authoritative `totalsByMonth` total so the header still reads the correct remainder. Each panel supplies the row's date: Sales → `soldAt`, money received → `receivedAt`. (Debts is a flat debtors list — it has no month sections.) Headers render via the shared `MonthSectionHeader`; sticky headers are disabled. Selection / select-all still resolve against the flat slice array (the sections are built from it), so multi-select is unaffected. Full month names come from the `months_long` i18n block; "This Month" from `common.current_month`.
  - **Month totals.** Each panel also passes `groupByMonth` a `getAmountUsd` row-to-USD function, so every section carries a `totalUsd`; `MonthSectionHeader` renders it (formatted into the display currency) at the trailing edge of the header, next to the row count. Sales sum the **value sold** (`totalAmount`, matching `soldAt`); the money-in history sums the **cash received** (`amount / ratePerUsdSnapshot`, matching `receivedAt`). (Debts no longer uses month sections — it's a flat debtors list; the debtor detail modal groups a customer's debts/payments via the shared `DebtList`.)
    - **Sales/Payments are paginated (`PAGE_SIZE` = 30) — summing only the loaded rows would under-count any month with more rows than one page.** Both panels instead pass `groupByMonth` a 5th arg, `totalsByMonth: Record<"YYYY-MM", number>`, which — for any month key present — overrides the local per-row sum. That map comes from `saleSlice`/`collections`'s `monthlyTotals` state, refetched (in parallel with the paginated page) every time filters change via `SaleService.getMonthlyTotals` / `CollectionService.getMonthlyTotals`, and **patched in place after a write** by `addMonthTotal(totals, iso, deltaUsd)` — recording, correcting or voiding a row moves its month by that row's value instead of re-running the aggregate (a month the map does not hold is left alone: it was never fetched, so `groupByMonth` is already summing it locally), which bucket `SaleRepository.monthlyTotals` / `CollectionRepository.monthlyTotals` — the **same filters as `findAll`, but unpaginated and projected to just the 2–3 numeric columns needed to sum** (no joins beyond what a search/branch filter needs), so it stays cheap even over a whole table. `fetchMoreSales`/`fetchMoreCollections` (loading further pages of an unchanged filter set) do **not** refetch it — the total doesn't change, only which rows are visible. Debts isn't paginated (it loads its full filtered set up front), so it never passes this arg and keeps summing locally.

**Money received (tenant-wide):** `CollectionsPanel` lists every hand-over of
cash across all customers, newest first, defaulting to **this month**. Backed by
the `collections` slice + `CollectionRepository.find` +
`CollectionService.getHistory` (returns `CollectionListItem` — the header, its
split, the joined customer name and phone, and the one `kind` every line shares
or `'mixed'`). Branch scoping is the collection's **own** `branch_id` (gotcha
#103). Multi-select enables bulk void. The per-customer `payments` slice and the
month grid are untouched.

**The card answers four questions, in reading order** — who paid, how much, what
it paid, who holds the cash: the **customer's name** leads (bold, left) with the
amount bold on the right, the second line **names the bills** (`collectionLabel`
— the first two labels, then `+N more`; a bare "3 items" count named nothing),
and the third is the **collector** plus the moment the cash arrived, printed to
the **minute** (`formatDateTime`). The kind is told **twice**: by the **icon's
colour** and by a **kind chip** in words (Month / Sale / Custom / Mixed), both
read off one `KIND_STYLE` row (month and sale emerald — a sale is emerald
app-wide, so the receipt glyph parts them — manual violet, mixed indigo). The
chip was briefly dropped, because one emerald badge on every kind made the list
a green wall, and it came back the moment sale and month started sharing a
colour: a glyph alone is too quiet to classify a row, so the fix is to **tint
the chip per kind**, never to delete it. The other chips are exceptions only:
`N items`, the **holder**
(amber, and only when custody has actually moved — a collector still holding
their own cash gets none), and a red `Voided` carrying its reason under a
struck-through amount. **Amounts print in the currency physically handed over**
(`formatMoneyPair`, gotcha #128), with the display-currency value as a small `≈`
line under it and only when it differs.

**Chrome:** a `PeriodPicker` (the same one Reports uses — the window is now a
visible chip instead of a silent one-month default), then chips for **Customer**,
**Collected by**, **Type**, **Status** (not voided / voided only), **Sort by**
(Received date / Recorded date / Last updated) and **Order** (newest / oldest
first), then one **summary bar** — "Collected in this view" — which sums the
slice's unpaginated `monthlyTotals`, so it covers every matching row rather than
the loaded page. **Type filters on the frozen `collections.kind`** (gotcha #128);
status maps onto `includeVoided` / `voidedOnly` and the sort onto `sortField` +
`sortDirection`, all four server-side in both repositories, so paging stays
correct. **Sort by offers only dates the hand-over itself owns** — a due date
belongs to the bills it paid, of which there can be several, and an amount sort
across currencies would have to be an expression; both are left out on purpose
(gotcha #129). Received and recorded genuinely differ, because a received date
is user-picked and can be back-dated.

**Tapping a row opens what it settled** — the bill itself for a single-bill
hand-over, `CollectionSplitSheet` when it settled several, and **always the
split for a voided row**, whatever it settled: the bill behind a reversal is
owed again, so it is no longer that row's story. A voided row used to open
nothing at all, which left the one question staff actually ask — who cancelled
this, when, and why — with no surface to answer it. So the sheet keeps the
**kind** pill and adds a red **Voided** one beside it (a void does not change
what the cash paid for), names the void's time, **its author** (`voidedBy`,
carried on `CollectionListItem` and patched into the store by `applyVoided`, so
it is right the instant you void) and its reason, heads the bills **"This had
paid"** with the caption *these bills are owed again*, and drops the custody row
entirely — a voided hand-over holds no cash, so "now with Sami" would be a lie. That sheet is the
hand-over's whole record: the total (+ `≈`), a status pill, then an `InfoRows`
block (customer · received to the minute · who took it · where the cash is now,
or "Banked" · **notes**, which were stored but shown nowhere before · the void
time and reason), then one `CollectionItemCard` per bill carrying the **bill's**
total, due date and billing instant. A bill card deliberately does **not** print
a remaining balance: that is the sum of every hand-over against the bill, so it
belongs to `BillSheet`, one tap away. `BillSheet` gained the same depth (customer,
month billed, bill total, due date, billed-at to the minute, who billed it,
notes) and now speaks the **bill's own currency** throughout — hero, remaining
and every payment row — with one `≈` display line under the hero.

---

## The Ledger (charges + collections)

Everything about money — what is owed, and what was handed over — lives in three
tables. This replaced the whole `payments` / `custom_debts` / `debt_payments`
family, and the reason is one sentence:

> `payments.amount_paid` and `sales.amount_paid` each hold **one number and one
> date**, so when a customer pays 12 now and 8 next month there is nowhere for
> the 8 to go.

Raise `amount_paid` and the 8 counts as revenue on the original date; leave it
and the row says he still owes it forever. Every debt problem the app had grew
from that: `debt_payments` was a workaround that could only point at a
*customer*, never at which month or sale it paid; debt was a customer-level
`Σ categories − Σ payments`, so no individual line's balance was trustworthy;
"Complete" existed only because `amount_paid` had no date of its own.

### The model

| Table | Role | One row = |
| --- | --- | --- |
| `charges` | what is owed — **the bill** | a month, a sale, or a hand-typed fee |
| `collections` | money physically handed over | one hand-over: "$55, 5 Mar, taken by Sami" |
| `collection_items` | which bill that money paid | one bill touched by that hand-over |

A bill can take many payments and a payment can cover many bills — a genuine
many-to-many, which is exactly why the middle table exists. Partial payments,
installments, pay-later sales and oldest-first collection then all fall out for
free, and the wallet, the dashboard and Reports each collapse to a single source.

```
balance(charge)  = charge.amount − Σ collection_items (of non-voided collections)
debt(customer)   = Σ balance where balance > 0 AND (kind <> 'month' OR paid > 0)
owed(customer)   = debt items + unpaid months from buildMonthGrid, deduped on
                   (customer_plan_id, billing_month) — the charge row WINS
revenue(period)  = Σ collection_items in the period, by collections.received_at
wallet(user)     = Σ collections where held_by_user_id = user, per currency
```

**Nothing asks "does a charge row exist?" — everything asks "how much money came
in?"** A month bill left at 0 collected (after a void) reads *identically* to no
row at all. Miss this and a voided payment leaves a ghost debt behind.

### Balance is never a column

`charge_balances` is a `security_invoker` view (the `product_stock` precedent);
offline the same `GROUP BY` runs over the mirror, so one mapper serves both. Two
devices can therefore both collect offline without clobbering a counter.

> **The view's `CASE` is load-bearing.** `p.voided_at IS NULL` sits in a LEFT
> JOIN's `ON` clause, which does not *drop* an item whose collection was voided —
> it only leaves the joined row all-NULL. A bare `SUM(i.amount)` keeps counting
> voided cash, and voiding a payment never gives the balance back.

### The waterfall

`ledger/utils/waterfall.ts` is pure — no I/O, no clock. `allocate(amount, items)`
spreads money **oldest due date first, filling each bill completely** before
moving on. Never proportional: a customer settles his oldest bill, he does not
part-pay all of them.

The sort has **four levels**, and each earns its place:

1. `dueDate` — when it HAD to be paid. Never the date it was typed, or a fee
   back-dated to 2020 would jump the whole queue (gotcha #74 in a new place).
2. `issuedAt` — a January month billed today loses to one billed last week.
3. `createdAt`
4. `keyOf(item)` — a total order, so the preview and the save can never disagree
   and two devices splitting the same money land identically.

Leftover money means **overpay**, and the service refuses it: there is nowhere
for unapplied cash to live.

#### The order is SHOWN, not just applied

An automatic split is only trustworthy if staff can see WHY the money went where
it did. So the preview is drawn in the waterfall's own order and says so:

- **`CollectSheet` re-sorts its own pool** with the same `sortByDue` before
  rendering — it never trusts the order the caller handed it over in. The Debts
  screen passes two separately-sorted lists glued together
  (`[...items, ...unpaidMonths]`), and `buildDebtsView` sorts on `dueDate` alone
  while `allocate` sorts on four levels, so without this the rows could say one
  thing while the money did another.
- **`AllocationPreview`** (`ledger/components/AllocationPreview.tsx`) renders it.
  Each row carries its **queue number** (1, 2, 3…), its **due date** and **how
  many days late** it is. The number is **filled** once money reaches the bill
  and a **hollow outline** while it is still waiting behind the ones above it.
- **Unticking a row re-numbers the ones below it** — the rule "the money moves
  down to the next bill" shown instead of explained. A skipped row greys out,
  strikes through its label and shows a `×` badge.
- A row nothing reached prints **what it still needs**, since its status line
  ("Not covered") does not say it the way "Leaves X owing" does.

The section header carries one caption naming the rule (`ledger.waterfall_hint`),
and `daysLate()` lives in `core/utils/date.ts` — one copy, shared with
`ChargeService` and `DebtItemCard`.

### Virtual months

A month has **no charge row until money reaches it**. `LedgerService.getOwed`
therefore merges two sources — stored bills, and unpaid months derived from
`buildMonthGrid` — deduped on `(customer_plan_id, billing_month)` with a
**PAID stored bill winning**. Miss the dedupe and an empty month charge left by a
voided collection is counted twice.

An **EMPTY** stored bill (nothing collected) deliberately LOSES the dedupe: it
must read like a month never touched, price included, so the virtual month wins
and carries the line's CURRENT price. The grid takes the same branch in
`monthItemFromEntry` (`entry.collected > 0`, not `entry.charge`), and both
`CollectionRepository.create` paths re-price the stored row to match before
collecting — otherwise the sheet would show the new price and bill the old one.
A bill money has reached always keeps its frozen amount. See gotcha #106b.

Collecting is what turns a month into a bill: `CollectionService.collect`
materializes it in the same write, with an id from
`deterministicId(customer_plan_id, billing_month)` — so two devices collecting
the same month offline converge on ONE row instead of billing the customer
twice.

### A line with no set price

A custom-price plan — or a customer with no plan at all — has no figure to bill,
so `resolveLinePrice` returns `kind: 'typed'` and **`getOwed` skips the line
entirely**: nothing can be poured over a bill whose amount nobody has typed. The
month cell still collects. It builds an **open item** (`OpenItem.openAmount`,
amount / balance / currency all empty) and the collect sheet grows one extra
field, **Amount for this month** — that field IS the bill, and it also decides
the currency, since an open item has none of its own.

Three rules:

- **Single item only.** Two open months in one write are two different unknown
  amounts, so a grid multi-select containing one is refused with a message.
  Quick pay follows the same rule: one price-less line opens the sheet on the
  customer list itself, two send you to the month grid.
- **Once the amount is typed the item becomes an ordinary bill**
  (`billedOpenItem` in `CollectSheet`), so a part payment, the "leaves N owing"
  hint and the overpay refusal are the existing code, not a second
  implementation. "Owed 50, paid 20" works exactly as it does for a priced line.
- **The bill is raised at what was typed**, in the hand-over's currency:
  `CollectionService.materialize` uses `item.amount > 0 ? item.amount : line.amount`.

Once that first bill exists the line behaves like any other — the remainder is a
debt, and the Debts screen and the waterfall both see it. See gotcha #112.

### Owed vs debt

| | includes | consumed by |
| --- | --- | --- |
| **OWED** | everything with a balance, plain unpaid months included | the waterfall, and only the waterfall |
| **DEBT** | partly-paid months, open/partly-paid sales, hand-typed fees | the Debts screen |

`isDebtItem(kind, paid) = kind !== 'month' || paid > 0` — one function, in
`ledger/utils/openItems.ts`. **A fully unpaid month is NOT a debt**: it is
`unpaid`/`overdue` in the month grid, which is its own screen and its own
workflow. It becomes a debt the moment it is *partly* paid, which is exactly
when it stops being routine.

**The Debts screen never lists a plain unpaid month at all**, and that is
structural, not a filter: `getDebtsView` reads **stored bills only** (no virtual
pass — do not add one), and a month has no bill until money reaches it. So the
`unpaidMonths` section fills only from **partly-paid** months. The one leak was
an **empty** bill — a month paid and then voided keeps its `charges` row with
`paid = 0` — which made voiding a payment the single way an unpaid month could
appear there, showing that lone month while the customer's genuinely unpaid
months stayed hidden. `buildDebtsView` now drops `kind === 'month' && paid <= 0`,
so an emptied bill reads exactly like a month never touched (gotchas #106,
#106c).

### Void vs write-off

Two different statements about one bill, and `chk_charges_void_xor_write_off`
keeps them mutually exclusive:

| | means | effect |
| --- | --- | --- |
| **void** (`voided_at`) | it was a MISTAKE — it never existed | gone from every figure. `voidCharge` is refused once money sits on it; `voidChargeWithPayments` is the deliberate "take the cash with it" door (see below) |
| **write off** (`written_off_at`) | it is REAL but will never be paid | leaves "still owed", reported as a **loss** in Reports → Debts |

Voiding a **collection** is the third, and different again: the cash was real
but should not have been recorded. Every bill it touched gets its balance back
on its own, because a balance is a sum over live items and this row stops being
one.

**A dead bill still owns its month, so collecting it REVIVES it.** `charges`
is unique on `(customer_plan_id, billing_month)` whatever the row's state, so a
voided or written-off month bill is the only row that month can ever have —
while every read (the grid, the debts screen, `charge_balances`) filters it out.
Cash aimed at that month would therefore be saved onto a row nothing can see:
counted in the wallet and in revenue, but the cell red again on the next
refresh, for ever. So the write fixes its target first. `reviveTargetBill(s)`
does two INDEPENDENT things: it clears all six void / write-off columns
**unconditionally** whenever money is about to land (cash contradicts both "it
was a mistake" and "it will never be paid"), and separately re-prices an EMPTY
month bill. Keeping them independent is the whole lesson — the un-void used to
be bundled into the re-price and so ran only when the price happened to have
moved. Two supporting rules: the paid check that guards the re-price sums
`collection_items` directly (a balance read hides the very row being fixed and
would answer 0), and `charge_balances` now excludes **only** voided bills,
because a write-off gives up on the remainder and does not un-collect what was
already handed over. "No longer owed" is decided in one place,
`ChargeRepository.find`. Gotcha #115.

### One currency per hand-over

A collection carries one currency, and it must equal the currency of every
charge it pays — which is why `collection_items` has **no currency or rate of
its own**. That is what lets a balance close at exactly zero, with no rate drift.
A customer owing in two currencies is collected from twice, and the collect
sheet shows a currency picker to say so. USD for revenue and the wallet uses the
**collection's** frozen rate (what physically arrived); USD for a debt total uses
the **charge's** (what he was billed).

### Screens

| Where | What |
| --- | --- |
| `CollectSheet` | the ONE collect form. Two modes: a whole customer (type an amount, watch the waterfall split it, untick a row to steer the cash on) or a single bill. Same write either way, so one code path and one audit shape. |
 hero, then **every payment that reached it**, each with its own date and collector. |
| `BillPaymentsList` | the payments half of `BillSheet`, on its own — the list of hand-overs against ONE bill, with the per-row menu (send receipt / void this payment). Shared with the **sale receipt**, because a month and a sale are the same `charges` row to the ledger. |
| `CollectionCard` | one hand-over. A single-bill payment names it inline; several wear a `3 items` marker. **Tapping the card opens what it settled** — the bill itself, or `CollectionSplitSheet` when it closed several. A voided row is inert. |
| `CollectionSplitSheet` / `CollectionItemCard` | the bills ONE hand-over settled, each a card that opens its own bill — the split shown rather than explained. Needs no read: the list already hydrates every item's charge. |
| `useOpenBill` | "show me the bill behind this row", read-only. A month and a manual fee open the shared `BillSheet`; a **sale** opens its receipt through an injected `onOpenSale`, because the sale sheet lives in the sales module and sales depends on the ledger — never the reverse. `open(charge)` takes the bill; `openOwed(item)` takes an `OpenItem`. **Neither reads**: an `OpenItem` built from a stored bill carries that `Charge` (`openItemFromCharge`), exactly as a `CollectionItem` carries its own, and a sale needs only the `saleId` already on the row. A **virtual** month opens nothing: there is no record behind it yet. |
| `CollectionsPanel` / `CollectionsHistorySheet` | the money-in history. ONE list where there were two (payments and debt payments). Reached from the quick-actions menu. |
| `CollectQuickActionSheet` | "Collect money" from anywhere: pick a customer, the waterfall does the rest. |
| `DebtsPanel` | one row per customer who owes, **sorted by how far behind they are**. |
** part-paid fraction, an orange **Written off**. They were a single grey micro-line before, where the one fact a debts list is opened for was the easiest thing to miss. The balance prints in the **bill's own currency** with a `≈` display line only when they differ (#128). `Chip` is shared (`shared/components/Chip.tsx`). |
| Opening a debt row | **Tapping any row in the debtor sheet opens the record behind it** — `useOpenBill.openOwed`, the same door the money-in history uses, so a month and a fee land in `BillSheet` and a sale lands in its receipt. `DebtsPanel` takes `onOpenSale` from `TransactionsScreen` (via `useSaleDetailSheet`), keeping debts free of any dependency on sales. Read-only: no collect and no void-bill footer, since the row's own 3-dot already owns those. Voiding a payment from inside bumps `owedVersion`, so the sheet and the list behind it follow with no patch of their own. |

**The split preview is the heart of the collect sheet.** Staff sees exactly what
the money will do BEFORE saving, which is what makes an automatic allocation
trustworthy instead of magic.

### Where voiding lives — two doors, two statements

Under the old model "void this month's payment" was meaningful. It is not any
more: one hand-over can settle three months and a sale, so *which* payment is a
real question. So there are two doors, and they say different things.

**Void one payment — the narrow door.** *That hand-over was wrong; the bill is
still owed.* It lives in `BillPaymentsList`, per payment row — so on the
month bill sheet and on the sale receipt, and nowhere else — with
the row saying *"also paid other bills"* when the decision is wider than it
looks. This is the everyday correction: cash mis-recorded, wrong customer,
wrong amount.

**Void the bill — the wide door.** *This should never have been billed at all*,
so the cash sitting on it goes too. One primitive,
`ChargeService.voidChargeWithPayments`, behind three entry points:

| Where | Label |
| --- | --- |
| month cell 3-dot | **Void this month** (whenever the month has a bill — including an unpaid one still holding the bill a voided payment left behind) |
| `BillSheet` footer | **Void this month** (red, last — the per-payment void above it is the usual correction) |
| a sale's 3-dot / receipt | **Void sale** (`SaleService.voidSale`) |

Three rules hold it together:

- **Payments first, bill second.** If the bill's own void then fails, what is
  left is an *unpaid bill* the customer still owes — recoverable. The other
  order strands live cash on a bill that no longer exists.
- **Always say the money goes — with no number.** The confirm states it
  unconditionally, so nothing reads the ledger on the way into the dialog: a
  hand-over that also settled other bills is voided **whole**, so voiding
  January's bill can hand February back too, and the message says exactly that.
- **`voidCharge` still refuses a paid bill.** That is what keeps the narrow
  paths (a debt row's void) from quietly destroying cash.

**A MONTH bill is voided NEWEST-FIRST.** Voiding July lowers *July* while a paid
August sits above it — the very "✓ Paid on top of Overdue" shape the pay rule
forbids (#79/#81) — so both month entry points go through
`payments.voidMonthBill`, which asks `PaymentService.billVoidOrderBlocker` first
and shows a popup naming the month to void first ("August 2026 is paid on this
plan. Newer months must be voided first."). The rule lives in the **payment**
slice, not the ledger one, because a **sale** has no month order. The whole bill
is the write, so a multi-month block is judged by every month it covers, and a
**partially**-paid later month still blocks. The **payment** void needs no gate —
it leaves its bill exactly where it was, owed. And `voidSale`
voids only the **payments** — `repository.voidSale` already voids the sale's own
charge inside its transaction, so one record keeps one owner.

**One write, not a loop — this is a performance rule with teeth.**
`CollectionRepository.voidMany` voids every hand-over in a single UPDATE (and,
offline, a single transaction). A loop over `void()` costs a read + a write + an
audit insert *per row* online, and offline opens a transaction per row — each
queuing behind `withDbLock`, since expo-sqlite gives the app one connection.
That queue is what made the first cut of this feature slow, and the same rule
retired the old loop inside `CollectionService.voidCollections`. `voidMany`
returns only the rows it actually voided, and offline returns them
**un-hydrated** — no caller reads the joins, and `hydrate` is three more queries.

**Nothing counts the payments to warn about them.** The confirm messages state
that any money collected is voided too — unconditionally, with no figure — so
opening a void dialog costs no reads at all. An earlier cut fetched a count per
surface just to fill in "{{count}} payments", which re-read exactly the rows the
write goes on to read anyway (`voidChargeWithPayments` needs their ids
regardless). A number in that sentence does not justify a round trip on the way
into a dialog.

### The sale writes its own bill

`SaleService.createSale` passes a `charge` alongside the header, the lines and
the stock movements, so offline the whole thing is ONE transaction — a sale can
never exist without the thing that makes it collectable. Cash taken at the till
then goes through the **normal collect path**, so custody, the audit entry and
the currency rules are written in exactly one place. If that second step fails
the sale simply stands fully owed, which is the safe way round.

`Sale.amountPaid` still exists, but it is **derived** — `SaleService.withMoney`
fills it from the bill's balance. Editing a sale re-prices the bill and leaves
every collection against it untouched; the form shows the collected amount
read-only and refuses a total below it.

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
  screens/      CollectionsPanel
```

State: the `ledger` slice (debts view, one customer's owed pool, collections,
`netByCustomer`) and the `collections` slice (the paginated history). The
`payments` slice kept only **month-grid** state — bills, skips, and the three
per-line derivations the UI gates on.

---

## Regular Customer

`Customer.isRegular` (default `true`) distinguishes subscription customers from occasional ones.

| Behavior                    | Regular (`isRegular = true`)   | Non-regular (`isRegular = false`) |
| --------------------------- | ------------------------------ | --------------------------------- |
| Paid cell color             | Green                          | Yellow/Gold                       |
| Unpaid cell color           | Red                            | Light gray                        |
| Unpaid banner shown         | Yes (current month, if unpaid) | No                                |
| Counted in "unpaid" tab     | Yes                            | No                                |
| Dashboard `unpaidThisMonth` | Counted                        | Excluded                          |

See gotcha #16.

---

## Skipped Months

A **skipped month** is a month one service line is **not expected to pay** — a free month, a vacation, a service pause. It is neither paid nor unpaid, and it is reversible.

**Model — `skipped_months`, one row per (service line, month).** Columns: `tenant_id`, `customer_id`, `customer_plan_id`, `billing_month`, `skipped` (BOOLEAN), `note` (optional), `skipped_by_user_id`, timestamps. `UNIQUE(customer_plan_id, billing_month)` — deliberately the **same natural key as `payments`**, so the grain matches the grid and offline can derive a deterministic id.

- **Unskip flips the boolean to `false`; the row is KEPT.** A deleted row would carry nothing to the other devices (the pull is latest-`updated_at`-wins), so the toggle is the sync signal. Re-skipping the same month reuses the row. The store only ever holds the **active** skips (`skipped = true`) — `SkippedMonthService.getSkipsForCustomer` / `getActiveSkips` filter server-side.
- Carries **no money at all**: skipping never creates, clears, or touches a debt, a payment, or the wallet.
- **Any user** can skip or unskip. `skipped_by_user_id` records who last set the state.

**Grid rule (the only status change).** `buildMonthGrid(line, payments, skips, year)` inserts one step: `before_start` → `paid` → **`skipped`** → `future` → `unpaid`. So **money always wins** — a skip left on a month that later gets paid is inert (the cell reads paid), which is why the service does not need to guard against skipping an already-paid month. The cell renders slate with a "Skipped" sub-label for regular and non-regular customers alike, and `MonthEntry.skip` carries the note for the sheet.

**Not payable — the user must unskip first.** There is no "pay anyway" (except for a *locked* skip, below):

- Tapping a skipped cell opens the **unskip** confirmation (checked *before* the inactive/cancelled gate, since unskipping is not a payment).
- The `?quickPay=1` deep link from the customer list shows `payments.skip.pay_blocked` instead of the form.
- Every other pay path filters on `isPayableStatus` (`'unpaid' || 'future'`, plus a locked skip), so the new status excludes itself: `canQuickPay`, `payableEntries`, and `isPayable` in `monthSelection.ts`.
- A **multi-month block** covering a skipped month is refused whole (`assertNoSkippedMonths` → `errors.months_skipped`) — the block covers consecutive months and cannot leave a hole.

**Unskip follows the VOID rule, and a locked skip becomes payable instead.** An unskip turns "nothing expected" back into an **unpaid** month, so it may not run while a **later** month of the same line is paid — that is the "paid month sitting on an unpaid one" shape the pay/void order rules exist to prevent (gotcha #84, the fifth door of #79).

| | Behavior |
| --- | --- |
| Rule | `PaymentService.assertUnskippableInOrder(months, linePayments)` — the same `blockingPaidMonths` helper the void gate uses, so a bulk unskip is judged as one write. Called from the payment slice's `setMonthsSkipped` when `skipped === false` (the slice holds the customer's full payment history; `SkippedMonthService` stays payment-ignorant on purpose). Message: `errors.later_month_paid_unskip`. |
| Grid | **Unskip disappears** (cell menu + multi-select toolbar) and the month becomes **payable** — the cell tap opens the payment form, and Pay now / Pay & send appear for a fixed-price plan. Nothing errors: the month can still be settled, just by collecting it. |
| Why paying works | Money outranks a skip in `buildMonthGrid`, so the payment settles the month and the skip row goes inert. The payment form shows an amber `payments.skip.locked_pay_notice` explaining it. |
| Multi-month | A block covering a **locked** skip is allowed — `assertNoSkippedMonths` exempts any skip earlier than the line's latest covered month, since "unskip it first" is an instruction the app itself refuses. |
| Customer list | Untouched: a skipped current month is still "nothing due", so quick pay keeps leaving those lines alone (`notDueLineIds`). Only the grid, where the user picks one month, offers the pay. |

**Nothing is owed, so nothing counts it.** Two paths had to learn the rule:

| Path | Behavior |
| --- | --- |
| `PaymentService.buildCustomerStatus` | Everything the customer list shows comes from here, off `buildMonthGrid` — so a skipped month simply never resolves to `unpaid` and cannot make a customer overdue. A skipped month is **not a required month**, so it never counts in the "N/M plans paid" tally and never blocks "paid": a line paid through February with March skipped is settled. `status` is `"skipped"` when the customer owes nothing **and** no line owes this month because of a skip. |
| `CustomerRepository.countUnpaidForMonth` (web + offline) | The dashboard's `unpaidThisMonth` skips those lines — and so does its `dueThisMonth` sibling, so a skipped customer is in neither half of the collection-progress bar. |

**Customer-list badge.** `status === "skipped"` means the customer owes nothing at all **and** the reason no line owes this month is a skip on **every** started active line. The card shows a slate **"Skipped"** pill and the list's **Unpaid** tab leaves them out. A customer with one skipped and one unpaid line is still `"unpaid"` — only *all* lines skipped counts. An older unpaid month outranks the slate pill entirely: the customer owes money, so the card reads **"Overdue"** instead — a skip excuses its own month, never a backlog.

**`coveredLineIds` was renamed `notDueLineIds`** (now `CustomerStatus.notDueLineIds`) because it means "must not be quick-paid this month" — already covered by a payment **or** skipped. `CustomerListScreen`'s `eligibleFixedLines` / `hasUnpaidStartedLine` read it per customer, so "Collect all due" leaves skipped lines alone.

**UI.** `SkipMonthSheet` (a `ConfirmDialog`, like `VoidSheet`) handles both directions: skipping takes the optional note, unskipping echoes back the note it was skipped with. Entry points: the month cell's 3-dot menu (**Skip month** on unpaid/future, **Unskip month** on skipped **unless a later month is paid**), a tap on a skipped cell, and the grid's **multi-select** toolbar — a selection can hold both kinds, so *Skip* and *Unskip* appear together and each acts on its own subset. A skipped cell's selection unit is always just itself (never part of a payable block). The year card shows a **"N skipped"** chip next to paid/unpaid when the year has any.

**Offline.** `skipped_months` is a synced tenant table (`db/tables.ts` + `PUSH_WAVES`, right after `payments`) with a local `UNIQUE (customer_plan_id, billing_month)`. Writes go through `upsertNaturalKeyDirty` — the generalization of the old `upsertPaymentDirty` — and the id is `deterministicId('skip', customer_plan_id, billing_month)`, prefixed so it can't collide with the payment id built from the same pair. Push uses the natural key as the conflict target (`conflictTarget` in `sync/push.ts`), so two devices skipping the same month converge.

---

## Customer Map Location

Each customer can carry an optional `Customer.locationUrl` (`customers.location_url`, nullable) so a
collector can navigate to the customer's home.

- **Capture (customer form).** A "Location on map" section in `CustomerFormSheet.tsx` has an **Open
  Google Maps** button (`openMapsApp()` in `src/shared/lib/maps.ts`) plus short numbered steps, then a
  text field to paste the Google Maps share link. The link is stored **raw** — we deliberately do
  **not** parse coordinates, because the "Share" button in Google Maps usually returns a short
  `maps.app.goo.gl` link with no coordinates inside it (it needs the network to expand).
- **Use (customer details).** When `locationUrl` is set, `CustomerDetailsCard.tsx` shows an **Open in
  Maps** row that calls `openLocation(url)` — it just re-opens the saved link via `Linking.openURL`
  (prepending `https://` when the pasted text has no scheme); the Maps app resolves short links itself
  and offers directions. No map library, no Google Maps API key, no native rebuild — same
  `Linking.openURL` pattern as `openWhatsApp` in `src/shared/lib/whatsapp.ts`.

---

## Multiple Plans per Customer (service lines)

A customer can subscribe to **several plans at once** (e.g. an ISP customer with internet + IPTV), each paid independently. The model splits the account from the service:

- **`customers`** — the account/person (name, phone, branch, `is_regular`, `active`). No `plan_id`.
- **`customer_plans`** (a **service line**) — one plan the customer is on, with its **own** `start_date`, `cancelled_at`, `active`, and optional `custom_price` + `custom_currency_id` (its **special price**). `plan_id` may be NULL for a custom/occasional line.
- **`payments`** — link to a line via `customer_plan_id`; uniqueness is `UNIQUE(customer_plan_id, billing_month)`, so each line is paid separately for the same month. `plan_id` stays as the price snapshot.

**Layers.** New `customer-plans` module (repository / service / mapper) mirrors `plans`. The thin `customerPlans` slice exposes `syncLines(customerId, lines, removed, reactivated, tenantId)` (which applies the customer form's inline Plans editor) plus `hasPayments(lineId)` (does a line have any recorded payments — drives the remove-plan prompt). `removed` is a `RemovedLine[]` (`{ id, hardDelete }`); `reactivated` is a plain `string[]` of cancelled line ids brought back to active (they also appear as active drafts in `lines`, so they ride the upsert path — a reactivated id makes its update also flip `active`/`cancelled_at`). `CustomerPlanService.syncLines` runs removals + create/updates **concurrently**, **skips kept lines whose plan + start date are unchanged** (no round-trip — but never skips a reactivation), and **returns the resulting lines** (`{ active, cancelled }` — `active` includes reactivated lines). The slice rebuilds the owning customer's `customerPlans` **locally** via `customers.setCustomerLines` (active result + soft-cancelled removals + previously-cancelled lines kept for history, minus anything reactivated or hard-deleted) — **no `fetchCustomer` re-fetch** — so the grids built from them re-render. The edit path is therefore one round-trip when nothing about the plans changed (the customer update already returns fresh lines), instead of update → per-line write → re-fetch.

**Managing plans — in the customer form.** Add / change / remove / reactivate plans happens **inline in `CustomerFormSheet`** (create AND edit): a "Plans" section lists one row per line — each row is the **plan dropdown + an inline start-date picker + a delete button on one line** — plus an "Add plan" button (minimum one *active* row — a plan-less row records custom amounts). The start date is editable per line and is the **only** start date in the system — `customers` has no `start_date` column, and a customer starts when its first line does. The first row of a brand-new customer defaults to today; an added row inherits the previous row's date. On save, the form creates/updates the customer then calls `syncLines`. **Remove** = hard-delete a line with no payments, else the prompt below. **Cancelled lines stay visible** in the editor (dimmed, read-only, with a "Cancelled" badge and a **Reactivate** button). Every customer ends up with ≥1 active line.

**Removing a plan that has payments — keep vs delete-permanently prompt.** When the trash icon is tapped on an existing active line, the editor first asks the slice `hasPayments(lineId)`. If the line has recorded payments, a **confirm dialog with a checkbox** appears (`RemovePlanChoice`): *"Delete permanently"*. Unchecked (default) → the line is only **soft-cancelled** (`active = false`), its payments untouched, and its row stays in the editor as a cancelled row you can reactivate. Checked → `CustomerPlanService.deleteLine(id, hardDelete=true)` calls `repository.delete(id)`, which **hard-deletes the line and cascade-deletes all its payments** (FK `ON DELETE CASCADE`) — the row disappears. This hard delete is an **intentional exception to rule #7** (no hard deletes); the dialog copy warns it can't be undone. Backing out of the dialog keeps the plan active. A line with no payments still removes silently (hard-delete). The checkbox rides inside the shared `confirm()` dialog via its `content?: () => ReactNode` option — a render callback kept **outside** immer state (like `pendingResolve`) and read back through `confirm.getContent()`; the checkbox owns its own state and reports the value through a closure ref the editor reads after the promise settles.

**Reactivating a cancelled plan.** Pressing **Reactivate** on a cancelled row flips it back to active (and its fields editable). If the line was soft-cancelled *in the same editing session* (still pending in `removed`), the two cancel out — the removal is simply dropped, no DB call. Otherwise the id goes into `reactivated`. On save the row is a normal active draft (`getLines` includes it), so it flows through `syncLines`' **single upsert path** as an update that **also re-activates** it (`CustomerPlanService.updateLine(id, draft, reactivate=true)` → `repository.update` with `active = true, cancelled_at = null` alongside plan/date — one write, so any edits made after reactivating are saved too). It deliberately does **not** run a separate reactivation write: doing both once double-listed the line in the locally-rebuilt `customerPlans` (a transient duplicate until the next fetch). Payments were never touched by a soft-cancel, so nothing else is restored.

**Per-line special price.** A line may carry its own privately negotiated price — `custom_price` + `custom_currency_id` (NULL currency = USD) — which **replaces** the plan's price for that line only. It exists for customers whose fee isn't the catalog price: billed by quantity, or on a private agreement. Without it the only options were a `is_custom_price` plan (staff retype the amount every month, quick pay disabled) or a private one-off plan per customer in the shared catalog (which also consumes the tier's `maxPlans` limit).

*Where it's set.* Inline in the customer form's Plans editor, as the last control on each row, by **any** staff member (no admin gate). It is **collapsed to one line** by default — the effective price plus a "Special price" link ("Price: 10.00 USD per month", or "Amount typed each month" with no plan price) — because "just charge the plan price" is the overwhelming case and the editor shows one row per line. Tapping the link opens a `CurrencyInput` inline; a row that already carries a special price opens **expanded**, so the figure is never hidden. The link back is "Use plan price" (or "Clear" with no plan price). There is deliberately **no separate mode/radio state**: the amount itself is the state, so "special selected but nothing typed" cannot exist and the control can never hide its own input. `getLines` normalizes before saving (no currency without an amount). Filling an amount turns a type-it-every-month line into a one-tap-payable one.

*How it's read.* Never directly — one pure resolver, **`resolveLinePrice(line)`** in [customer-plans/utils/linePrice.ts](../SubsTrack/src/modules/customer/customer-plans/utils/linePrice.ts), returns `{ amount, currencyId, durationMonths, isFixed, kind }` (`kind`: `special` | `plan` | `typed`) and is the single answer for the payment form, all three quick-pay paths, the grid's price header and the customer-list "Collect all due" filter. `isFixed` — *an amount is remembered* — is what now makes a line quick-payable, replacing "has a fixed-price plan". The amount and its `currencyId` always travel together because the currency is what freezes `payments.rate_per_usd_snapshot` (gotcha #85).

*Rules.* **Any plan length**, single- or multi-month. A special price replaces the plan's price for the plan's **own billing span**, so on a 3-month plan it means "100 **per 3 months**" — one payment of 100 covering three months, never 100 × 3. `resolveLinePrice` therefore returns the **plan's** `durationMonths` alongside a special amount, and every label names that span (`subscriptions.per_month` / `per_n_months`, carried into `price_is_per` and the expanded field's own label `price_special_per`) — the period must be unmissable where the figure is typed, or a bundle price reads as monthly and under-charges by the plan's length. The only remaining check is `CustomerPlanService.assertCustomPricesAllowed`, now a pure amount test (`errors.custom_price_positive`) with no DB round-trip. **Not frozen once the line has payments**, unlike `start_date`: the start-date lock exists to protect the month grid, and `buildMonthGrid` never reads a price, so a change only affects the **next** collection — every recorded payment keeps its own `amount_due` snapshot, and the audit trail (already wired for `customer_plans` on both platforms) records who changed it. Because `custom_currency_id` is `ON DELETE RESTRICT` like the other currency FKs, `CurrencyService`'s reference count includes it, so deleting a currency used only by a special price still soft-deletes.

**Month grid.** `PaymentService.buildMonthGrid(customerPlan, payments, skips, year)` builds **one grid per line** (payments pre-scoped to the line, boundary = `line.startDate`). The payment slice keeps `monthGridsByLine` keyed by line id; the algorithm is otherwise unchanged (rule #1).

**Customer detail (tabbed, view-only selector).** `CustomerPaymentPanel` shows a **line selector** (tabs) above the year card; one line's grid at a time. A single-line customer auto-selects it and hides the selector, so it looks exactly like before. Cancelled lines stay visible (dimmed) for history. The selector does **not** add/edit/remove lines — that's the customer form's job. Pay / void actions are scoped to the selected line and pass `line.id` as `customerPlanId`. Each tab carries a small **status dot** derived from that line's viewed-year grid (`lineIndicatorStatus`, worst-state-wins: unpaid=red > paid=green; a partial payment reports as paid; no dot when nothing is due yet) — reusing the grid statuses already in `monthGridsByLine`, so it re-derives per year as you navigate and matches the grid/summary-chip colors.

**Payments on a cancelled plan (or inactive customer).** A cancelled line stays **payable for its PAST + CURRENT months** (record via form, quick-pay, and bulk-pay all work); only **calendar-future** months are blocked (a "Not available" dialog: `payments.cancelled_plan_future_blocked`, or `payments.inactive_future_blocked` when the whole customer is inactive — customer-inactive takes priority). This is one shared gate in `CustomerPaymentPanel` — `isPayBlocked(entry) = (!customer.active || !lineActive) && isCalendarFuture(entry)` — used by `handleCellPress`, `canQuickPay`, and the `payableEntries` bulk filter, so all three paths agree. Note **calendar**-future (year/month strictly after now) — the current month is always payable. The collect sheet is only ever opened through that gate, so a past/current cancelled month collects normally.

**Aggregation across lines.** Customer-list status is aggregated over a customer's **active** lines by `PaymentService.buildCustomerStatus` (the single implementation — see CLAUDE.md → Customer-List Status): `"paid"` (green) only when **every** line owes nothing across **all** the months it was required to pay, from its start date to today (a **partial** payment counts as covered — its remainder is a debt, not an unsettled month), and a separate `overdue` flag (its own red pill) when any active line has an *earlier* unpaid month — **except** last month while the `customer_start_day` billing day hasn't arrived, which is owed (red cell, red "Unpaid" pill) but not *late* yet, so no "Overdue" (gotcha #83). Because "paid" means "owes nothing", **it can never appear beside "Overdue"** (gotcha #56b). A **skipped** month, a month before the line's start, and under the `customer_start_day` rule the current month before its billing day, are **not required at all**: they are treated as if they did not exist, and a customer whose lines owe nothing *and* have no month due this month reads "Skipped" / "Not due yet" rather than unpaid. Under the default `month_start` rule there is **no grace period**: the current month counts as unpaid from day 1 on both the card and the grid, so the two always agree (gotcha #34).

**Customer-list filter tabs = the card's pills.** The list carries **Active · Unpaid · Overdue · Partly paid · Paid · Not due yet · All · Inactive** (one line, scrolling sideways on a phone — `PillTabs` is a horizontal `ScrollView`). The five payment tabs are the five flags `customerFlags(status)` puts on a card (`customers/utils/customerFlags.ts`) — the card maps over that list to render, the filter asks `.includes(activeTab)` — so a tab holds exactly the customers whose card shows that pill and nothing else, and a customer wearing two pills is listed under both. Consequences worth knowing: **Unpaid** means "collectable right now" (every due plan unpaid this month **and** no earlier unpaid month), because an **overdue** customer's current month cannot be paid until the backlog clears (oldest-first, gotcha #77) — so they sit in **Overdue** only, and their card likewise shows one "Overdue" pill instead of "Unpaid + Overdue". **Partly paid** is the `mixed` (N/M plans) case and is the **only** pill that can share a card with "Overdue"; **Paid** requires every plan settled across all its required months (a partial payment counts), so it never holds an overdue customer; **Not due yet** collects the customers who owe nothing at all and have no month due this month for a non-skip reason (no plan, plan not started, or the `customer_start_day` billing day not reached). Under that rule the **Unpaid** tab can hold a customer whose current month is not quick-payable — an unpaid last month is owed but not late yet (#83), so the pill is "Unpaid" while oldest-first still requires that month to be collected first from the grid. All five are active + regular only — inactive / non-regular cards carry their own pill instead. `skipped` has no tab. A customer whose status hasn't been computed yet is in no payment tab (absence is never read as debt).

**"N/M plans paid" badge (multi-plan).** A customer with **2+ in-play plans where some owe nothing and some still owe** is `status === "mixed"` and gets its own amber badge — e.g. **"1/2 plans paid"** — instead of the plain red "Unpaid", so a partly-paid account is never confused with a fully-unpaid one. The tally is `CustomerStatus.planCount { paid, total }` where `total` = lines that have ever had a **required** month and `paid` = lines with **no unpaid required month at all** (not merely this month — a plan behind on January never counts as paid, which is why "3/3 plans paid" can't sit next to "Overdue"). A month is required only when the grid resolves it to `paid` or `unpaid`, so `before_start`, **skipped** and not-due-yet months are excluded on both sides of the fraction. **One** code path computes it — `PaymentService.buildCustomerStatus` — for both the bulk load (`getCustomerStatuses`) and the post-pay/void patch (`syncCustomerStatus` in the slice), so there is nothing to keep in lockstep. A partially-paid line counts toward `paid` (a partial payment reports as `paid`), so a single-plan customer who paid partially reads as fully **paid** (green) — the remaining amount shows only on the Debts tab.

**Not-due-line tracking (quick-pay eligibility).** Alongside the tally, `CustomerStatus` carries **`notDueLineIds`** — the service-line ids that must not be quick-paid this month: they already have a covering (non-voided) payment, full or partial, **or** the month is skipped on that line. A line that is merely *not due yet* under the `customer_start_day` rule is deliberately **absent**, so paying early stays possible. Its companion **`uncoveredLineIds`** carries the other reason quick pay must skip a line — an **earlier** month nothing was collected for, whether or not the customer reads as overdue yet — because months are settled oldest-first, so this month can't be collected first (#83). Both are per customer (no global `Set`), refreshed with the rest of the map by `fetchCustomerStatuses` and patched by `syncCustomerStatus` after a local pay/void. Quick pay skips any line in it, so a **mixed** multi-plan customer pays only its still-due plans and never re-pays a line (the payments `createMany` upsert would otherwise overwrite the existing row and reset its remittance). The list's void-this-month path refreshes the whole map afterwards so freed lines become quick-payable again.

**Collect all due.** Customer-list Quick Pay (single or bulk) collects **every eligible fixed-price line still unpaid this month**, as ONE hand-over per customer **per currency** — a collection cannot mix currencies, so a customer billed in both USD and LBP is two rows, which is what physically happened. Already-covered and backlogged lines are filtered out by `CustomerStatus.notDueLineIds` / `uncoveredLineIds`; custom-price / plan-less customers fall back to the detail screen.

**Card 3-dot menu labels (single vs multi).** The quick-pay and void rows are worded by how many plans are in play this month (started active lines): a **single-plan** customer shows plain **"Quick pay"** / **"Void current month"** (with the plain "Void Payment?" confirm); a **multi-plan** customer shows **"Quick pay unpaid plans"** / **"Void paid plans"** (with the "Void paid plans?" confirm that spells out voiding every plan paid this month + whole multi-month bundles). Quick pay appears whenever any started plan is still unpaid — so a mixed customer shows **both** rows at once. Keys: `payments.quick_pay.menu_label` / `payments.quick_pay.pay_unpaid_plans`, `payments.void_current_month` / `payments.void_paid_plans`.

See gotchas #1, #16, #25, #41.

---

## Pay Oldest Month First

A month is **not payable while an earlier month of the same service line is still unpaid**. Collectors work through a backlog in order, so an account can never show a paid March on top of an unpaid January.

- **What counts as "still unpaid"** — a month whose grid status is `"unpaid"`. A **skipped** month is not expected to pay, and a **partially paid** month reads as `paid` (its remainder is a debt), so neither blocks. Future months never resolve to `unpaid`, so a fully settled line can still be prepaid.
- **The whole write is judged at once.** Selecting January + February + March on the grid and paying them together is allowed; paying only March is refused. A multi-month block is judged over every month it covers, so the block that starts at the first unpaid month always goes through.
- **All years are checked**, not the viewed one — a backlog from a previous year blocks a payment this year even though the grid on screen cannot show it.
- **Where it stops you** — tapping the month cell, the cell's "Pay now" / "Pay & send" menu rows (hidden), the grid multi-select Collect action, the customer-list quick pay (the line is dropped from "collect all due") and the `?quickPay=1` deep link. Each names the oldest month to collect: *"January 2026 is still unpaid on this plan. Older months must be paid first."*
- **Skipping, editing an amount and viewing a receipt are unaffected** — the rule is about recording new money only. **Voiding has its own mirror rule** (below).

One implementation, two layers: `blockingUnpaidMonths()` in [`utils/payOrder.ts`](../SubsTrack/src/modules/customer/customer-payments/utils/payOrder.ts) decides, and the UI reads the same helper through the slice's `uncoveredMonthsByLine` (per line, all years) and `CustomerStatus.uncoveredLineIds` (customer list) before it ever opens the collect sheet. See gotcha #77.

### Void Newest Month First

The mirror rule, and the reason the pay rule actually holds: **a month cannot be voided while a LATER month of the same service line is still paid.** Voids therefore run backwards — undo the newest paid month, then the one before it. Without this, voiding January while February stayed paid recreated exactly the state the pay rule exists to prevent.

- **What blocks** — any month the line currently has money on, later than the earliest month being voided. A **partially paid** later month blocks too (it is real money); a bill with nothing collected never does; **all years** are checked, so Dec 2026 is blocked by Jan 2027.
- **The whole void is judged at once** — selecting a paid tail (January + February) and voiding it together is allowed; cherry-picking January out of it is refused. A **multi-month block** is judged over every month its payment covers, and is always voided whole.
- **Per service line**, never per customer: line B's January voids freely while line A holds a paid February.
- **Where it stops you** — the receipt sheet's Void button, the cell menu's "Void payment" row (kept **visible** and explaining on press, so the action never silently vanishes), the grid multi-select Void action, the customer-list "void current month" card menu, and the Transactions → Payments list (there the service refuses and the ErrorBanner carries it). Each names the newest month to void first: *"February 2026 is paid on this plan. Newer months must be voided first."*
- `blockingPaidMonths()` decides (same file), `PaymentService.assertVoidableInOrder` enforces it inside `voidPayment` / `voidPayments` / `voidCurrentMonth` — resolving the rows from their ids itself, so every caller is covered — and the UI reads the slice's new `paidMonthsByLine`.

### Start Date Frozen Once Paid

The third door into the same bad state: a service line's **start date can no longer be changed once the line holds a non-voided payment with money on it**. Moving it earlier invents unpaid months behind the paid ones; moving it later hides months whose payment rows still exist. The form's date input is disabled and **explains itself on tap** — a "Not available" popup reads *"Start date is locked — this plan already has payments."* — via `DatePickerInput`'s `disabledReason` prop (a greyed field with no reason reads as a bug, but a permanent caption under every locked row costs height in a list of one card per service line; a **cancelled** row passes no reason, since the whole row is read-only, not just the date). `CustomerPlanService.syncLines` refuses the write regardless (checked only for lines whose date actually changed). A line whose payments were **all voided** is editable again. The probe is `findPaidLineIds(customerId)` — one query per form open; deliberately **not** the delete prompt's `countPayments`, which counts voided rows on purpose.

**Still possible:** unskipping an old month can leave an unpaid month behind a paid one. That door is left open by choice — the card reports it as **"Overdue"** (never "✓ Paid", which means the customer owes nothing at all), so the contradiction can't reach the screen even from legacy data.

---

## Payment Scenarios

Every month is collected through **one** sheet now — `CollectSheet`. What differs
between scenarios is only what the sheet is handed, and that comes from
`resolveLinePrice(line)` (the plan's price, or the line's own **special price**;
see Multiple Plans per Customer → Per-line special price). "Fixed" below means
*an amount is remembered*, which is what the scenario actually turns on:

| Scenario | Condition | What happens |
| --- | --- | --- |
| A — Fixed | `resolveLinePrice(line).isFixed`, `durationMonths = 1` | The cell's item carries the remembered amount. **Quick pay** collects it in one tap; the sheet is only needed for less than the full amount. |
| B — Part of it | Same as A | The sheet's amount is editable — type 12 of the 20 and the preview says *"leaves 8 owing"*. |
| C — Custom | `!isFixed` — a custom-price plan or no plan, and no special price | There is nothing to collect automatically: the cell has no price, so the menu offers no quick pay and the sheet explains why. Give the line a special price, or bill it as a hand-typed fee. |
| D — Multi-month | `durationMonths > 1` | The cells of one block collapse to **ONE** item billed from the block's first month — otherwise a 3-month plan would be billed three times for the same period. Quick pay confirms the range first. |

**Full vs partial is just the amount typed.** There is no mode switch on a month
any more: the collect sheet takes a number, the waterfall shows what it settles,
and whatever is left stays owed. A month that gets *nothing* is not recorded at
all — it is `unpaid` in the grid, which is already the right answer, and writing
an empty bill for it would be a row that says nothing.

**A partial payment counts as paid, and says so.** When `collected < amount`, the
month + customer still **resolve** to `"paid"` — there is no distinct "partial"
month status, and no guard, filter or aggregation changes (see
[gotchas.md](gotchas.md) → Ledger and CLAUDE.md → Month Grid). Only the
**presentation** tells them apart, off `entry.balance > 0`:

| Surface | Full payment | Partial payment |
| --- | --- | --- |
| `MonthCell` | paid fill, sublabel `Paid` | the same fill **+ an amber ring**, sublabel `PARTIAL` |
| `BillSheet` hero | the collected amount | `20/50 $` — collected out of owed (`formatPaidFraction`) |
| `DebtItemCard` | — | the same `20/50 $` fraction, on its date line |

Two rules the cell must keep: it is a **ring, not a fill**, because a non-regular
customer's paid cell is already yellow and an amber fill would be invisible
against it; and on a multi-month block only the **first** cell is ringed
(`!entry.isGroupSecondary`), or the per-cell borders draw seams through what is
meant to read as one joined pill.

**Correcting money is a void, never an edit.** A bill's price can be corrected
(a sale's, by editing the sale; a hand-typed fee's, by editing it); the *money*
cannot, because a hand-over is a physical event with its own date, collector and
custody. Voiding it and collecting again is the only path, and it is the honest
one — the trail then says what really happened instead of quietly rewriting it.

---

## Multi-Select & Bulk Actions

A reusable list selection mode: long-press a card to enter it, every card's avatar becomes a checkbox, and the `PageHeader` is replaced by a toolbar of icon actions. Selection state is **ephemeral Presentation-layer state** — no slice/service/repo involvement.

**Reusable building blocks (domain-agnostic):**

- `useSelection()` — [`src/shared/hooks/useSelection.ts`](../SubsTrack/src/shared/hooks/useSelection.ts). Returns `{ active, selectedIds, count, isSelected, toggle, toggleMany, enterWith, clear }`. `active` is **derived** from `selectedIds.size > 0`, so deselecting the last item auto-exits. All mutators are `useCallback([])`-stable. `toggleMany(ids)` flips a group atomically (all-selected → remove all, else add all) and `enterWith(id | ids)` accepts a single id or an array — both used by the month grid to move a whole multi-month block as one unit.
- `useSelectionBackHandler(active, onExit)` — same file. Registers a focus-gated Android `BackHandler` (via expo-router `useFocusEffect`) so hardware back exits selection instead of navigating. The app's only `BackHandler` site; no-op on iOS/web.
- `SelectionBar` — [`SelectionBar.tsx`](../SubsTrack/src/shared/components/SelectionBar.tsx). **The single selection row shown on every list/panel** while selecting — one flow row carrying everything: an optional leading **select-all checkbox**, the close (X) button, "N selected" (`common.selected_count`), then the icon-only action row. Props `{ count, actions, onClose, allSelected?, onToggleAll? }`; the checkbox only renders when `onToggleAll` is passed. Wire `onToggleAll` to `toggleMany(visibleIds)` (select-all when not all selected, clear when all are) and `allSelected` from `visible.every(selected)` — "all" means the **currently visible/loaded** rows (post-filter, post-pagination), never unloaded pages. Action shape `SelectionAction = { key, icon, label /*=a11y label*/, onPress, destructive?, disabled? }`.
- `PageHeader` `selection?: { active, count, actions, onClose, allSelected?, onToggleAll? }` prop — [`PageHeader.tsx`](../SubsTrack/src/shared/components/PageHeader.tsx). When `active`, `SelectionBar` is overlaid **in place of** the whole header (branch selector disappears automatically), passing the select-all props straight through. Header-based list screens supply `allSelected`/`onToggleAll` here so the whole selection UI lives on that one row; they wrap their search/filter row in `SelectionOverlaySlot` only to **blank that row's space** while selecting (no jump), no longer to host a separate select-all bar. The Transactions panels (no `PageHeader`) render the same `SelectionBar` inline. All non-selection callers are untouched (prop is optional).
- `Checkbox` — [`Checkbox.tsx`](../SubsTrack/src/shared/components/Checkbox.tsx). Presentational by default (parent owns the tap).

**Card participation** (the repeatable card change): `CustomerCard` takes optional `selectionMode`, `selected`, `onToggleSelect`, `onEnterSelection`. In selection mode tap toggles (not open-detail), long-press is disabled, the avatar `<View>` is swapped for a `<Checkbox>` of the **same footprint**, and the 3-dots button is hidden. Outside selection mode the 3-dots `ActionMenu` is unchanged.

**Customers wiring** ([`CustomerListScreen.tsx`](../SubsTrack/src/modules/customers/screens/CustomerListScreen.tsx)): selected ids are resolved against the **visible** `filtered` list (`selectedCustomers`) so a filtered-out row can't be acted on. Toolbar actions are count-dependent — **1 selected:** edit · activate/deactivate · delete · quick-pay (toggle + delete admin-only); **>1:** delete · quick-pay only (a single toggle verb is ambiguous over a mixed active/inactive set). In selection mode the search box and FAB are hidden. Selection is cleared on tab switch, pull-to-refresh, and branch change (search/branch are unreachable while selecting; pagination keeps it).

**Bulk quick pay** collects from every eligible customer, ONE hand-over per
customer per currency (`executePay` groups the items and calls `ledger.collect`
for each group). Selected customers are partitioned in the screen: eligible
fixed-price lines → collected (single + multi-month, each at its own resolved
price for the current month); custom-price / plan-less → **skipped**; ineligible
(inactive / non-regular / already covered / backlogged / before start) → silently
dropped. A confirm dialog always shows, warning how many multi-month lines will
be charged for their full duration and how many custom-price lines are skipped
(an info dialog with `hideCancel` when nothing is payable). Each group is its
own write, so a partial failure is real and is reported as a `bulkNotice`
`ErrorBanner` — the earlier all-or-nothing single upsert is gone with the
batched `createMany` it depended on. **Bulk delete** is a real batch via `customerSlice.bulkDeleteCustomers` → `CustomerService.deleteManyCustomers` → one `customersWithPayments` query + parallel `deactivateMany`/`deleteMany` (see the batch-delete note under [Multi-Select & Bulk Actions](#multi-select--bulk-actions)); the slice adjusts `activeCount` by however many deleted rows were active. A lone selection still reuses the single-item `handleDeleteCustomer` confirm.

**Rolled out to every list screen.** The same pattern now lives in Products, Plans, Users, Branches, Currencies, and both Sales lists. Each card (`ProductCard`/`PlanCard`/`UserCard`/`BranchCard`/`CurrencyCard`/`SaleCard`) gained the four optional props + `<Checkbox>` swap; each screen wires `useSelection()` + `useSelectionBackHandler()`, resolves selected ids against its **visible** list, passes `selection={…}` to its `<PageHeader>`, and hides search/FAB while selecting. Toolbar actions are count-dependent — **1 selected:** edit (+ the row's state toggle: deactivate/reactivate for branches/currencies, reactivate for inactive products, activate/deactivate for manageable users); **all counts:** the destructive verb.

**Bulk delete is a real batch — never a per-row loop.** Each module has a `deleteMany`/`bulkDelete*` chain: `repository.deleteMany(ids)` / `deactivateMany(ids)` are single `.in('id', ids)` statements, and the service partitions ids into hard vs soft via one reference query (the shared `BaseRepository.referencedIdsIn(table, column, ids)` helper). So a bulk delete of N rows is **≤3 round-trips total, independent of N** (resolve references → one batch soft-update + one batch hard-delete in parallel) instead of N×(count + delete). The service returns the `{ hard, soft }` id split; the `bulkDelete*` slice action applies it to `items` (remove hard, flip soft to `active:false`) and refreshes usage — no refetch. Failures surface through the slice's normal `error` banner (the batch is effectively all-or-nothing, so there's no partial "X of Y" notice for deletes). Soft/hard rule per module mirrors the single delete: **products** (sales ref), **currencies** (plan/payment ref), **branches** (user/customer/plan ref, plus the "≥1 active branch must survive" guard via `countActiveAmong`), **customers** (payment ref → soft sets `cancelled_at`, hard cascades payments), **plans** (always hard — assigned customers fall back via `ON DELETE SET NULL`).

- **Users** are the one partial exception: a single `delete-user` **edge function** removes the auth user, so hard deletes can't collapse to one SQL statement. `UserService.deleteUsers` still batches everything it can — one `usersWithPayments` lookup, one `setActiveMany` soft-delete — and only the auth hard-deletes run as parallel edge calls. Permission is enforced per id (`checkToggleActivePermission`); the screen pre-filters via `canManage` (own account / role hierarchy) and reports skipped rows (`users.bulk_delete_skipped` / `bulk_delete_none`).
- **Sales** (no edit, destructive = **void with a shared reason**): the toolbar's single "void" action opens [`SaleBulkVoidSheet`](../SubsTrack/src/modules/sales/components/SaleBulkVoidSheet.tsx) (a `ConfirmDialog` + reason `TextInput`, mirroring `BulkVoidSheet`). It calls `saleSlice.voidSales(ids, voidedBy, reason)` — a per-row loop over `saleService.voidSale` (voiding is an audit-logged single-row mutation, not a batchable delete) that drops voided rows and returns `{ ok, failed }`. A total failure keeps the dialog open with the error; any success closes it and reports counts via `common.bulk_void_summary`. `CustomerSalesListScreen` reuses the same sheet but `refresh()`es its customer-scoped `useCustomerSalesList` afterwards (voids route through the global slice so the Sales tab's cache also drops the row).

### Month-grid bulk actions

The month grid on the customer detail screen has its own selection mode (same `useSelection()` hook, distinct from the customer list — it acts on one customer's months, not on customers). Wired in [`CustomerPaymentPanel.tsx`](../SubsTrack/src/modules/customer-payments/components/CustomerPaymentPanel.tsx); selection keyed by `billingMonth`.

- **Entry/exit:** long-press a non-`before_start` cell enters selection; tap toggles; the per-cell 3-dot menu hides; toolbar X / Android back / emptying / **year change** / unmount exit. `before_start` cells are inert.
- **Toolbar placement:** an `InlineSelectionToolbar` (`X · "N selected" · [Pay] [Void]`; the shared compact toolbar for panels embedded in a screen, `src/shared/components/`) renders as an **absolute overlay over the year-header row** (inside a `relative` wrapper, `bg-white`), directly above the grid — not in the page header (unlike the customer list). It overlays rather than inserting into the flow **on purpose**: pushing the grid down mid-long-press would shift cells under the user's finger and toggle the wrong month on release. Pay shows when ≥1 selected month is payable, Void when ≥1 is voidable; a mixed selection shows **both**, each acting only on its eligible subset.
- **Cell visual:** selected cells gain a `border-2 border-primary` ring plus a filled check-circle badge (where the 3-dot sits); selectable-unselected cells show an empty circle. Status colour stays visible.
- **Auto-expand unit** ([`utils/monthSelection.ts`](../SubsTrack/src/modules/customer-payments/utils/monthSelection.ts) `expandSelectionUnit`): a cell backed by a live payment selects **every visible month sharing that `payment.id`** (whole block, for voiding); a multi-month-plan payable cell selects its **start-aligned N-month window**; otherwise just the cell. Windows are anchored at the **line's** `startDate` month via absolute month index, so they never overlap and never start before the start date.
- **Collect** turns the selected payable cells into `OpenItem`s and opens the ONE collect sheet over them — the waterfall splits the typed amount oldest-first and the preview shows it before saving. A **multi-month** plan collapses its selection to one item per block via `groupPayableBlocks`, billed from the block's first month, so a 3-month plan is never billed three times for the same period. There is no bulk **void** here any more: one hand-over can cover several months, so undoing it is a decision about the payment, taken in `BillSheet`.
- **Loops are sequential** (same `loadingCreate`/`loadingVoid` early-return constraint as the customer list); per-iteration `getStore().getState().payments` checks aggregate ok/failed into an amber `bulkNotice` banner on partial failure. Multi-month with a missing/disallowing tier counts as failed (the service `assertMultiMonth` gate).

---

## Audit Trail

An **append-only** record of who changed what, when, and what the value was before. It exists because nothing remembered the old value — the exact fact an admin-vs-staff dispute turns on.

**The app writes the trail, NEVER a Postgres trigger.** A trigger only fires when the row reaches Postgres, which for an offline device is at the **next sync** — it would stamp the sync moment and the syncing session instead of the real action and the real person, and a device that never synced would hold no history at all. So each repository writes its own audit row alongside the change. (This is why §9.1 of `new-features.md` originally said "triggers, no app code" — that note predates the offline-first layer.)

**What one row stores** — the `audit_logs` table: `tenant_id`, `branch_id` (denormalized from the row or its parent; NULL = tenant-wide record), `table_name`, `record_id`, `action` (`create` | `update` | `delete` | `void` | `restore`, CHECK-constrained), `before_data` / `after_data` / `changed` (JSONB), `label`, `subject`, `subject_id`, `actor_user_id`, `actor_username`, `occurred_at`, `created_at`, `updated_at`.

- An **edit keeps only the changed columns** — `changed` is the list of column names, `before_data`/`after_data` hold just those columns' old/new values (~150 bytes). Each entry is therefore self-contained and readable without hunting for the previous one. A **create** stores the whole new row in `after_data`; a **delete** the whole removed row in `before_data`.
- `updated_at` and the generated `balance` are **excluded from the diff**, so a form saved untouched writes nothing at all (`buildAuditRow` returns `null`).
- `actor_username` is a **snapshot**, so the trail still names the person after their user row is deleted.
- `label` is a **frozen one-liner** built by `describeAudit(table, row)` from the row's **own** columns only — a name pulled off another table would dangle once that row is deleted (same reasoning as `sales.items_summary`).
- `subject` is **who the record belongs to** — the customer behind a payment / sale / skip / service line. Also **frozen**, and for the stronger reason: a read-time `customer_id` → name lookup resolves to nothing once the customer is deleted, which is exactly when the trail matters most. It is supplied by the writing repository through one shared helper, `customerAudit(customerId)` on both base classes, which returns `{ branchId, subject, customerId }` from a single query — the branch lookup was already happening at every one of those call sites, so naming the customer costs nothing extra. Sales own their `branch_id`, so they use the subject-only `customerSubject(customerId)` (and `null` for a walk-in sale). On `customers` the record **is** the subject, so `buildAuditRow` fills it from the row's own `name` and no caller passes one. NULL for a record that belongs to nobody (a plan, a setting, a staff member) and for rows written before the column existed.
- `subject_id` is the **same owner as an id** — the key "everything about this customer" filters on. Frozen too, and never joined back to `customers`, only compared, so it survives the customer being deleted. `buildAuditRow` takes it from `AuditInput.customerId` (already passed by payments, service lines and skips), falling back to `record_id` on the `customers` table itself. NULL for anything whose writer doesn't name a customer — including sales, which are deliberately outside the customer timeline. Entries written before the column existed carry NULL and simply don't appear in a customer's history; there is **no backfill**, so an existing database needs `reset.sql` (dev phase) or one manual `ALTER TABLE audit_logs ADD COLUMN subject_id UUID`. See gotcha #75 for why a list of child ids could not do this job.
- `occurred_at` is the **device clock** — when the staff member acted, not when the row synced. Never sort or display the trail by `updated_at` (that is the server clock and the sync cursor).
- `branch_id` deliberately carries **no foreign key**: every other table uses `ON DELETE SET NULL`, which here would blank the trail when a branch is deleted. Evidence must outlive the branch. (`tenant_id` cascades, `actor_user_id` sets null.)
- Five indexes: `(tenant_id, occurred_at DESC)`, `(table_name, record_id, occurred_at DESC)`, `(subject_id, occurred_at DESC)`, `(actor_user_id, occurred_at DESC)`, and `(updated_at)` for the pull cursor.

**RLS — three policies, and one deliberate absence:**

- `audit_logs_select` — **admins only** (reuses the `tenant_settings_write` role test), branch-aware via the row's own `branch_id`.
- `audit_logs_insert` — **every** tenant member: a staff device must be able to push its own trail even though it can never read one back.
- **No UPDATE and no DELETE policy, on purpose** — append-only from the client; only `service_role` can rewrite or purge (the same "absence of a policy = service_role only" idiom as `app_options`).
- Consequence worth knowing, not a bug: a staff device's pull returns no audit rows, so its local table only ever holds its own un-pushed ones.

**Audited tables** (`AUDITED_TABLES` in `src/modules/admin/audit/utils/constants.ts`) — 13: `payments`, `sales`, `customers`, `customer_plans`, `skipped_months`, `plans`, `products`, `stock_movements`, `branches`, `currencies`, `users`, `tenant_settings`, `tenants`.

**`stock_movements` is audited for CHANGES ONLY — an edit or a revert, never the insert.** The ledger row already names the actor, the note and the time, so auditing the insert would duplicate the stock history — but a manual row can now be **corrected in place** ([Editing a stock entry](#editing-a-stock-entry)) or **reverted** ([Reverting a stock entry](#reverting-a-stock-entry)), and nothing else would remember that it once said 12, or who decided it never happened. So `addMovements` writes no entry, while `updateMovement` (an `update`) and `voidMovement` (a `void`) each write one. Two details are specific to it: the entry is filed under the parent **product's** `branch_id` and **name** (a movement owns neither — supplied through `auditedUpdate`'s `audit` option, the general seam for a child row whose parent owns those facts), and `subject` therefore holds a **product** rather than a customer, so `subjectLabel()` / the card's subject icon key off the table instead of assuming a person.

**Deliberately not audited:** `sale_items` (no independent life — the parent sale covers it, and its `items_summary` is already frozen there). **`collection_items`** is out because it has no life of its own: the parent collection's `after_data` carries the whole split, so the trail literally reads "55 → 20 Jan, 20 Feb, 15 Sale #13". Also out: the log tables themselves (`exception_logs`, `audit_logs`) and `app_options` / `tier_plans`, which this app never writes (`scope: 'global'`).

Rows written before these two were dropped stay in `audit_logs` and still render (the table label keys are kept in the locales for exactly that); only the filter no longer offers them.

**Writing it — one line per call site:**

- `BaseRepository.audit(input)` (web/online) — **fire-and-forget and never throws**. Returns `void` and inserts in the background, so the trail never sits between the user's save and the spinner stopping. Call it without `await`.
- For a child row pass `customerId` instead of a pre-resolved `subject`/`branchId`: `audit()` looks it up **inside** the detached write, so that query is off the user's critical path too, and it only fills the fields the caller omitted (sales pass their own `branchId`, so only the name is inherited).
- `OfflineBaseRepository.auditIn(db, input)` (native) — called **inside the caller's `write()` transaction**, so the change and its trail commit or roll back together. A failure here **does** propagate; rolling back is the correct outcome.
- `auditedUpdate()` / `auditedDelete()` on both base classes wrap the repeated read-patch-diff dance. `branchColumn: null` marks a table with no branch dimension; `branchColumn: 'id'` is for `branches`, which *are* a branch.
- Builders live in `src/core/audit/`: `buildAuditRow.ts` (diff + actor/tenant/timestamps, `null` when nothing changed) and `describe.ts` (the `label`). The actor is read through a **lazy `require`** of the global store — same require-cycle reason and shape as `src/core/errorLog/errorLogger.ts`; a top-level store import from a file `BaseRepository` imports would crash.

**Reading it** (`src/modules/admin/audit/`) — `IAuditRepository` is **read-only**; writes come from each repository, never through it.

- **Every read is server-first, and there is no caller-chosen scope.** `OfflineAuditRepository` delegates to the Supabase sibling and merges this device's **un-pushed** rows (`_dirty = 1`, same filter, de-duped by id) on top — they exist nowhere else until the next push, so a server-only read would hide the newest actions taken on this very device. Un-pushed rows join **page 0 only**: they are newer than the last successful push, so they belong at the top, and merging them into every page would repeat them.
- **No connection (or an unreachable server) degrades the answer, it never fails it** — the read falls back to the local 30-day window and reports `source: 'local'`, which the UI turns into a one-line note. The trail is evidence: showing less is acceptable, showing nothing is not. (This replaced a `RequiresConnectionError` + a "Load full history" button the admin had to find and tap.)
- Ordered by `occurred_at DESC`, never `updated_at`.
- `IAuditRepository` therefore returns `{ rows, source }` (and `hasMore` for the paged read) rather than a bare array. **`hasMore` is the repository's answer, not the caller's**: the merged `rows` length no longer reveals whether the server page was full, and the two paths page differently anyway — the local window at `OFFLINE_PAGE_SIZE` (100), every Supabase query at `PAGE_SIZE` (30).

**UI** — **Admin → Audit Log** (`app/(app)/(tabs)/admin/audit.tsx`): filter chips (record type / action / staff / date range), a day-ordered list, tap for a field-by-field *before → new* diff sheet, and above the list a one-line note saying which trail is on screen ("the full history from the server" / "No connection — the last 30 days saved on this device"). The note is **informational only** — the server read is already the default, so there is nothing to press. Plus a per-record **History** action wherever a record can be opened, all of it the same `RecordHistorySheet`:

| Where | How it is offered |
| --- | --- |
| Products / Plans / Staff / Branches / Currencies | the card's 3-dot menu, directly under **Edit** |
| A bill (`BillSheet`) | reachable through the record-history action — **admin-only**, mirroring the read policy |
| A sale receipt (`SaleDetailSheet`) | the same button, above Void |
| A customer | its own sheet — see below |

**Adding it to another list is two lines**, and that is deliberate: `useRecordHistoryAction(table)` (`audit/hooks/`) returns `{ action, sheet }` — `history.action(recordId, name)` is the `ActionMenuItem` to push into the menu, `{history.sheet}` is rendered once next to the screen's `<ActionMenu>`. The hook owns the "which record is open" state, so no screen keeps its own. The menu row is offered to **every** role (like the customer card's): a non-admin's read returns no rows and the sheet says "Admins only" — an empty list would instead read as the false claim "this was never changed". The two receipt sheets gate their button on `isAdmin` because a receipt is staff-facing and a dead-end button there is worse than an absent one.

`subtitle` is what the record is called — a product/plan/branch name, a staff member's full name, a currency **code**, the sale's frozen `items_summary`, the payment's month label — shown under the sheet title so a trail is never anonymous.

**The header branch chip narrows the list, and RLS is not enough on its own** (gotcha #73). `audit_logs_select` scopes a branch-**bound** user, but a tenant-wide admin (`branch_id IS NULL`) is meant to see every branch — for them the picker is the only filter, so it has to reach the query. `AuditFilter.branchFilter` carries it through the standard seam: `resolveBranchFilter(get().auth.user)` in the audit slice → `applyBranchFilter` (Supabase) / `branchWhere` (SQLite), with `branchFilter` in the screen's `useFocusEffect` deps so switching branches refetches. The scope is **`shared`, not `owned`** — `audit_logs.branch_id` is legitimately NULL for records belonging to no branch (a plan, a tenant setting, a staff member), and `owned` semantics would hide every one of those the moment a branch was picked. `audit_logs` is deliberately **not** in `BRANCH_SCOPES`: the constant is local to each audit repository, so nothing else can pick up the wrong semantics by accident.

A third entry point is the **customer** trail: `CustomerHistorySheet` (`modules/customer/customers/components/`), opened from the customer card's quick-actions menu on the list **and** the clock icon in the customer detail screen's header. It merges the customer row, **every service line it has ever held**, and the **month payments and skips** on those lines into one newest-first timeline, so "renamed → a plan was cancelled → March was voided" reads as one story.

That read keys off the frozen `subject_id`: `IAuditRepository.findForCustomer(customerId, tables)` — one indexed query, `WHERE subject_id = ? AND table_name IN (…)`, `occurred_at DESC`. The table set is `CUSTOMER_HISTORY_TABLES` (`customers`, `customer_plans`, `payments`, `skipped_months`). It replaced a `findForRecords(targets)` call that had to enumerate every child id, which could not reach skips (hashed ids), could not fit hundreds of payments in one URL, and silently missed **voided** payments — see gotcha #75. `findForRecords` still exists for a genuinely multi-row entity that shares no customer.

Deliberately **not** in the customer sheet: **sales** — a one-off purchase with its own panel on the customer screen, and mixing the two buries the subscription timeline. Sale entries therefore don't set `subject_id` either; adding sales later means passing `customerId` at those audit call sites as well as extending `CUSTOMER_HISTORY_TABLES`. `charges` and `collections` **are** in it: they are the customer's money, and they carry `subject_id`.

Unlike the Audit Log tab, the customer sheet is offered to **every role**, since staff use these two screens constantly. A non-admin's `audit_logs_select` returns no rows, so the sheet shows an explicit "Admins only" state — never an empty list, which would read as the false claim "this customer was never changed".

**The entry card is two lines, and that is a constraint, not a coincidence.** `AuditEntryCard` shows **record type + `subject` + the action pill**, then **staff · when**. It used to also list the changed field names as chips, which pushed every row to three or four lines — a long trail became a wall — while still saying less than one tap does; naming *what* moved is the detail sheet's job. The action is carried by **colour + icon + pill**, never prose, so the list scans by shape before it is read.

**The detail sheet's top card is Customer · Staff · When · Fields changed.** The last row lists the human **names** of the columns that moved, comma separated (`changedFieldsLabel`), and is **hidden on a create/delete** — nothing "changed" there, and the whole-row snapshot below already lists every field. It replaced a "Record" row that printed the frozen `label`, i.e. two raw values glued with ` · ` ("2026-10-01 · 600"): unformatted by design (a frozen string can't go through the display registry) and, on a create, a repeat of the snapshot underneath. **`label` is still written** and stays the record's frozen one-liner in the DB — it just has no reader in the UI right now. The trade-off worth knowing: an **edit** now names the customer but not which record of theirs (a payment's month only shows if `billing_month` itself changed) — adding `billing_month` to `CONTEXT_FIELDS` and a read-time label row would bring it back.

Both admin views render the same **`<HistoryList>`** (`components/HistoryList.tsx`) — a purely presentational list (entries + loading/error/scope in, `onLoadMore` / `onLoadFull` / `onRefresh` out) that owns no query state, so it can be pointed at any filter. `inSheet` picks Gorhom's `BottomSheetFlatList` over RN's (a plain `FlatList` cannot scroll inside a sheet). Reuse it for any new "history of X" view rather than rebuilding the list, scope note and detail-sheet plumbing.

**Every history SHEET is one shell too** — `<HistorySheet>` (`components/HistorySheet.tsx`): the full-height `AppBottomSheet`, the draggable header (title + the record's name + Close), the **admin gate**, and the `<HistoryList>`. It renders a timeline and never loads one, so the only thing separating the two sheets built on it is which hook feeds them: `RecordHistorySheet` = `useRecordHistory` (one row, by `table` + `recordId`), `CustomerHistorySheet` = `useCustomerHistory` (one customer, by `subject_id`). A future "history of X" adds a loader, not a sheet. Keeping the admin gate **in the shell** is what stops a new call site from shipping the empty-list lie the customer sheet was fixed for.

**Displaying a raw value — the per-column display registry.** The trail stores raw columns on purpose (evidence, not prose), so a value the DB finds perfectly clear can be unreadable on screen: `month_start`, `admin`, a currency UUID. `valueDisplay.ts` (`modules/admin/audit/utils/`) is the ONE place that maps a column to human text — a small registry, not a chain of `if`s in the sheet:

```ts
const DISPLAY: Record<string, AuditValueFormatter> = {
  '*.currency_id': currency,                                          // any table
  'users.role': enumLabel({ admin: 'users.admin', user: 'users.user' }), // one table
};
```

- A formatter returns `null` for anything it doesn't recognize, so an unregistered column — or a value added later — still renders through `formatValue` exactly as before. **Never blank, never a crash.**
- One flat table keyed `<table>.<column>`, with `*.<column>` for a column that reads the same everywhere (the five person ids, `currency_id`, `branch_id`). First answer wins: the table's own key → the wildcard → the generic `formatValue`.
- Helpers: `enumLabel({ raw: 'i18n.key' })` for coded values, `idRef(kind, { blank, missing })` for an id column — `blank` names what NULL means *there* (a null currency is USD, a null branch is "Shared" on a plan but "Unassigned" on a customer), `missing` covers a deleted reference ("Deleted user" / "(deleted)"), so a UUID is never shown.
- **Ids resolve at READ time**, through `useAuditLookups()` (staff + currencies + branches; each `getX()` self-guards on its `loaded` flag). A name frozen at write time would go stale on a rename.
- A second, smaller registry names the **column itself** when a sibling decides it: `FIELD_LABELS` (`displayFieldLabel` → `formatFieldLabel`) titles `tenant_settings.value` after the setting ("Unpaid months rule") instead of the meaningless "Value". It feeds both the diff row's title and the "Fields changed" list, and is what keeps a setting edit readable now that the frozen `label` is no longer rendered — the old read-time label registry (`LABELS` / `displayLabel`) was removed with it.
- `showsColumn()` decides what a create/delete snapshot lists: never the technical columns (`id`, `tenant_id`, `created_at`, `updated_at`, `balance` — the same set the diff hides), and an id column only when the registry can name it, so "Currency: LBP" and "Received by: John" appear while `customer_id` and `plan_id` stay hidden.
- **Some values need a sibling column to be readable at all**: `tenant_settings.value` is `month_start` under one key and a currency id under another. `CONTEXT_FIELDS` in `buildAuditRow.ts` copies those columns into an edit's payload even when unchanged, **outside `changed`** so they never render as a change, and the read side exposes them as `AuditEntry.context`. Rows written before this simply carry less context and fall back to the raw value.

**Where the read state lives is split by lifetime**, and the split matters:

| State | Home | Why |
| --- | --- | --- |
| The admin screen's filter session + paging (`tableFilter`, `actorFilter`, `from`/`to`, `scope`, `page`, `hasMore`) | the **`audit` slice** (`useAuditSlice`), registered in `globalStore.ts`, reset in `storeReset.ts`, refreshed in `refreshActiveData.ts` | must survive navigating into an entry and back, and **must** be cleared on logout so a previous tenant's entries can never surface |
| One record's timeline in a History sheet | the **`useRecordHistory(targets)`** / **`useCustomerHistory(customerId)`** hooks, local to the sheet | per-record and transient; in the store it needed a second parallel set of fields (`recordItems`/`recordLoading`/`recordError`) that two open sheets would overwrite, plus a manual clear on close. Unmounting the sheet now discards it, and the hook carries a stale-response guard the slice version lacked. Both are thin wrappers over one internal `useAuditTimeline(key, load)` — `key` must stay a plain **string** and `load` a **module-level** function, or a fresh identity each render would re-fetch forever |

Don't move the record timeline into the slice, and don't move the filter session out of it.

**Storage** — ~150 bytes per row: a busy tenant at ~600 changes/month ≈ 90 KB/month locally and ~1 MB/year on the server.

**Shipping** — OTA-safe (no native module), but run `sql scripts/script.sql` **before** publishing: the push writes a column set the server must already have.

Offline specifics (the `appendOnly` + `pullDays` table flags, the `json` column type, local pruning) are in [docs/offline.md](offline.md); the traps are gotchas #57–#63.

---

## Developer Tools

**Native only** — gated by `IS_OFFLINE_CAPABLE`, since it's a viewer for the local SQLite mirror that only exists on native. Entry point: Settings → Data section → "Developer" row (hidden entirely on web).

- **Table browser** ([`DeveloperScreen.tsx`](../SubsTrack/src/modules/developer/screens/DeveloperScreen.tsx)): lists every table in `TABLES` (`src/core/offline/db/tables.ts`) plus the two bookkeeping tables not in that descriptor (`sync_meta`, `pending_deletes`), each with a live row count. Tapping a row opens [`DbTableViewer`](../SubsTrack/src/shared/components/DbTableViewer.tsx) — a reusable, fully self-contained component that takes only a `tableName` prop, runs `SELECT * FROM <table>` itself, derives columns from the fetched rows, and renders a horizontally-scrollable read-only grid. No editing anywhere.
- **Export Data**: dumps every table's raw rows (undecoded, `_dirty` included) as one JSON object (`{ [tableName]: rows[] }`) to the clipboard via `expo-clipboard`.
- **Import Data**: pastes a JSON blob of the same shape into a text box; after a destructive confirm (`confirm()` with `destructive: true`), it **wipes every local table** and inserts the JSON's rows exactly as given — no `encodeRow`/decode, no validation beyond "are the top-level keys known table names." This is intentionally raw and unsafe; it's a developer recovery/seeding tool, not a user-facing import.
- **Exception logging**: every caught error — React render errors (`ErrorBoundary`), uncaught JS errors (RN's global `ErrorUtils` handler), and every repository catch block (`BaseRepository`/`OfflineBaseRepository`'s shared `handleError`) — is written to a local `exception_logs` table via `logException()` (`src/core/errorLog/errorLogger.ts`), tagged with the current user/tenant and a `source` (`boundary` | `global_handler` | `repository` | `service`). The table is a synced tenant table but **push-only** (see [docs/offline.md](offline.md)) — logs go up to Supabase for centralized visibility but are never pulled back down into any device's mirror. Viewable locally like any other table in the Developer browser above.

---

## Collector Wallet

A **wallet** is the cash a user is **physically holding right now**. Like the debts view, it is **computed at runtime — never stored as a balance**. The only persistence is three columns on the ONE cash table, `collections`:

| column | meaning |
| --- | --- |
| `held_by_user_id` | who has the cash **now**. NULL = nobody: never attributed, or settled out of the system |
| `remitted_at` / `remitted_by` | the **final settlement** — when the cash left the chain for good, and who took it out. Only ever written together with `held_by_user_id = NULL` (`chk_*_custody`) |

`received_by_user_id` / `recorded_by_user_id` still name whoever **collected** it, and never change — that is what lets a received wallet still say "Collected by Ali".

No new table. A ledger keyed by payment id would go stale, because re-paying a voided month reuses the same row (gotcha #43); a column resets cleanly.

### The chain

Cash moves **up**, one rung at a time, and never sideways:

```
collector (user)  →  branch admin  →  tenant-wide admin  →  owner (superadmin)
   rank 0              rank 1             rank 2                 rank 3
                                             │                      │
                                       "Close out"            receiving
                                             └──── out of the system ────┘
```

A branch admin and a tenant-wide admin share `role = 'admin'` — only `branch_id` separates them (`NULL` = tenant-wide). **Role alone was never enough to decide a handover**, which is exactly the bug this replaced: `assertAdmin(role)` let a branch admin receive their **own** wallet and erase their accountability.

The rules are one pure file, [`wallet/utils/custody.ts`](../SubsTrack/src/modules/wallet/utils/custody.ts):

- `walletRank(u)` → 0–3 from `role` + `branchId`.
- `receiveBlock(receiver, holder)` → `'self'` | `'rank'` | `'branch'` | `null`, checked in that order so the caption names the first real reason.
  - **`self`** — nobody clears their own cash.
  - **`rank`** — strictly lower only, so two branch admins (or two tenant-wide admins) can never take from each other.
  - **`branch`** — a branch admin reaches only their own branch. An **unassigned** collector (`branchId` null) is therefore reachable only from rank 2 up.
- `canCloseOut(u)` → rank ≥ 2. The top of the chain has nobody above them, so they need their own exit or their wallet (and the dashboard cash tile) would only ever grow.
- `custodyTargetFor(receiver)` → where the cash lands: the receiver's id, or `null` for the owner, who has no wallet.

Enforced in **two layers**: `WalletService` asserts before every write, and the UI reads the same helper to disable an action with a caption. This is **service-layer** enforcement — `collections_all` is `FOR ALL` with tenant+branch predicates only, matching how the app already enforces the user-management ladder (`UserService.checkToggleActivePermission`).

> **One asymmetry worth knowing.** Cash the owner *receives* leaves the system (they have no wallet). Cash the owner *collects themselves* starts in their own wallet like anybody's, visible only in their **My Wallet**, where "Close out" produces the identical end state. Nothing is lost; it just needs one tap.

### What counts as held cash

Every non-voided row with `held_by_user_id = <the user>`, across the three cash sources:

- `collections.amount` — every hand-over, whatever it settled.

A held row also reports `kind`: the one `charges.kind` all its lines share, or
**`mixed`** when they disagree. That is honest rather than tidy — a single
hand-over can settle a month AND a sale, and no allocation could split the
physical cash between them.

`charges` are **excluded** — a bill is money *owed to the business*, not cash anyone holds.

**Per-currency + USD.** A holder may carry several currencies at once. `WalletService` groups their items by currency (`WalletCurrencyTotal` = the raw physical cash **plus** its USD value) and sums everything in USD via each row's frozen `rate_per_usd_snapshot` (drift-free, the same principle as `LedgerService`/`DashboardService`). The list shows one USD headline per wallet (formatted into the display currency); the detail shows the per-currency breakdown when more than one currency is involved.

### Acting on a wallet

Whatever the viewer may do resolves to one of three **modes**, decided once (`modeFor` in `WalletsScreen`, from the flags the service baked into each `UserWallet`) so the card menu and the detail sheet can never disagree:

| mode | when | what it does |
| --- | --- | --- |
| `receive` | `receiveBlock === null` | moves the cash into the **viewer's** wallet (or out, for the owner) |
| `close_out` | it's the viewer's own wallet and `canCloseOut` | marks it banked — out of the system |
| `view` | neither | look only; the menu says **why** instead of showing nothing |

Each mode offers the same three shapes: a single row's action, a **long-press multi-select** + the selection bar, and the bulk button ("Receive all" / "Close out all", which re-reads the wallet's current set first so it never acts on a stale list).

The write is one method, `transferCustody(ids, fromUserId, toUserId, actorUserId)` on each cash repository (`toUserId` null = settle out, which also stamps `remitted_at`/`remitted_by`). Its UPDATE is **guarded on `fromUserId`**, so a row somebody else already took is skipped rather than moved twice — two admins racing on the same rows can't double-count. `custodyValues()` builds the column set in one shared place, so the two exits can never drift apart.

### Detail-view transaction list

`WalletDetailView` (shared by the admin detail sheet and the self-view, differing only by `mode`) shows each transaction as a card with the **customer** as the primary line (walk-in sales show "Walk-in"), a secondary `type · descriptor · date · Collected by <name>` line, and the cash amount. **"Collected by" appears only once the cash has moved** — on an untouched wallet the holder *is* the collector, and the line would be noise. It carries client-side **filters** — customer, payment type, and a from/to **date range** — that narrow only the list, never the headline total.

### Self-correcting

Because the wallet is derived, voiding or editing a source row flows straight through on the next fetch. A void + re-pay of a month **resets** custody to the collector (the re-recorded cash is fresh) — handled in the payment upsert's reset block, alongside the remittance nulls. If cash was already settled and the source row is later voided, the holder's total can go **negative** (the business now owes them) — correct, and simply shown as a negative USD figure.

A holder is **not always a collector**: an admin who only ever *received* cash recorded none of it. `UserService`'s hard-vs-soft delete split therefore counts rows they **hold** as well as rows they recorded — otherwise `ON DELETE SET NULL` would silently empty their wallet.

### Where it lives

- Admin: **Admin → Wallets** (`app/(app)/(tabs)/admin/wallets.tsx` → `WalletsScreen`) — every wallet in the branch scope, **including the viewer's own**, marked with a "You" chip and no receive action. A holder the viewer cannot even see (users are branch-scoped by RLS, so a branch admin cannot read a tenant-wide admin's row) is **dropped from the list** — an un-nameable wallet they can't act on is worse than nothing.
- Every user: **Settings → My Wallet** (`app/(app)/(tabs)/settings/my-wallet.tsx` → `MyWalletScreen`) — their own cash. Read-only below rank 2; a tenant-wide admin or the owner gets "Close out" here.
- Dashboard (**admin-only**): a **Cash on hand** tile summarises the branch's un-settled cash — the net USD total with a `{holders} · {transactions}` sub-line, shown only when > 0. `DashboardService.getMetrics(branchFilter, viewer)` folds `walletService.getWalletsView(viewer, branchFilter)` into `walletCash` / `walletCollectors` / `walletTransactions`; the dashboard slice passes `viewer = null` for a non-admin, so their dashboard neither computes nor surfaces it.

### Code map

`src/modules/wallet/` — `utils/custody.ts` (the rules), `utils/custodyValues.ts` (the columns a move writes), `services/WalletService.ts`, `screens/`, `components/WalletDetailView.tsx` + `WalletCard.tsx`; slice `src/state/slices/wallet/walletSlice.ts` (hook `useWalletSlice`). The three cash services each expose `getHeldForWallet(...)` / `getHeldDebtPayments(...)` and `transferCustody(...)` / `transferDebtPaymentCustody(...)`, backed by `heldForWallet` / `transferCustody` on their repositories (web + offline). Types (`WalletItem` / `WalletCurrencyTotal` / `UserWallet` / `UserWalletDetail` / `WalletSource` / `ReceiveBlock`) live in `src/core/types`.

### Historical data

Running `script.sql` backfills `held_by_user_id = <the collector>` for every row that was **never handed over**, so those wallets look exactly as they did. Rows that had already been remitted stay `NULL` — **out of the system** — so no admin's wallet fills up retroactively. The backfill is idempotent (re-running moves nothing), and because the `updated_at` trigger fires on it, every touched row reaches the offline mirrors on the next incremental pull.
