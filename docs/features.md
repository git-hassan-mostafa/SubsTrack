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
- [Transactions Hub](#transactions-hub)
- [Debts](#debts)
- [Regular Customer](#regular-customer)
- [Skipped Months](#skipped-months)
- [Multiple Plans per Customer (service lines)](#multiple-plans-per-customer-service-lines)
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

**Recording a multi-month payment (`PaymentService.createMultiMonthPayment()`):**

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
- `payments.amount_due` / `amount_paid` + `payments.currency_id` + `payments.rate_per_usd_snapshot` — the customer literally handed over `89000 LBP`. **The LBP value is preserved forever**, and the USD equivalent is also frozen: every payment captures `currencies.rate_per_usd` at recording time into `rate_per_usd_snapshot`. PaymentDetailSheet, CustomerPaymentPanel year totals, and Dashboard aggregates all convert via this snapshot — they do not drift when the live rate is edited.
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

**`CurrencyInput`** ([src/shared/components/CurrencyInput.tsx](../SubsTrack/src/shared/components/CurrencyInput.tsx)) — the reusable input with an embedded currency dropdown. Used in PlanFormSheet (price) and PaymentFormSheet (custom amounts). The dropdown lists USD + active tenant currencies. Switching currency does NOT convert the typed number — switching means "I meant this number in the new currency."

**Display preference** is per-user, stored in **AsyncStorage** via `uiPrefStore.displayCurrencyId` (settable from Tenant Settings — no DB column). All read-only displays (PlanCard, DashboardScreen, admin/index revenue card, CustomerPaymentPanel year summary) convert their values to this currency at render. The currency a value was **stored in** is preserved in PaymentDetailSheet's primary line for receipt fidelity, with the user's display-currency equivalent as a secondary "≈" line.

**Aggregates** (Dashboard) sum across mixed currencies by converting each row to USD using its `rate_per_usd_snapshot` (drift-free historical totals) in `DashboardService.getMetrics()`. The screen then formats the USD total in the user's display currency.

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
- **Offline:** a normal tenant-scoped synced table. The offline write derives a **deterministic id from `(tenant_id, key)`** and upserts on that natural key (registered in `NATURAL_KEYS` **and** in `sync.ts`'s `conflictTarget`), so two devices setting the same option offline converge on one row instead of stalling the push on the UNIQUE index.

**Keys today:**

- `UnpaidStartRule` (`'month_start'` default \| `'customer_start_day'`) — when the **current** month turns unpaid. See [CLAUDE.md](../CLAUDE.md) → Critical Business Logic: Month Grid for the full rule; the one implementation is `isNotDueYet()` in `src/core/utils/date.ts`, shared by the grid, the aggregator, and both repositories.

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

`products` + `sales` extend SubsTrack beyond recurring subscriptions. `payments` (subscriptions) and `sales` are deliberately separate ledgers — they don't share schema or service code. Subscription month-grid logic is untouched.

**Products** mirror `plans` exactly: per-tenant catalog, optional currency, `branch_id IS NULL` = SHARED, soft-delete via `active = false` when a product has historical sales (hard-delete otherwise — mirrors `CurrencyService.deleteCurrency`). Tier-gated through `tier_plans.max_products` (Free: 5, Pro/Business: unlimited). Soft-vs-hard delete keys off **`sale_items.product_id`** references (not `sales`).

**A sale is a header + product lines.** One sale can hold **several products** (a small "cart"). The account/transaction lives on the `sales` header; each product is a `sale_items` row. This mirrors the `customers` → `customer_plans` header/line split.

- **`sales` (header)** — one transaction: `items_summary`, `total_amount`, `amount_paid`, `currency_id` + `rate_per_usd_snapshot`, `customer_id`, `recorded_by_user_id`, `sold_at`, void + remit fields. It is the unit of **partial payment / debt / wallet / dashboard** (all header-level, unchanged by multi-product).
  - `items_summary` — a **frozen** human summary of the products (e.g. `"Water ×2, Bread"`), built by the service at create time. It powers the Sales-tab **search** and the **list / debt / wallet labels** so those stay lean (no `sale_items` join needed). Contains every product name so search matches any of them.
  - `total_amount` — the summed line totals, **app-written** at create (a generated column can't sum a child table). Snapshot, never recomputed. `amount_paid < total_amount` leaves one "Sales" debt for the whole sale.
  - `rate_per_usd_snapshot` — currency rate at sale time, same drift-free principle as `payments.rate_per_usd_snapshot`. Use `paymentSnapshotCurrency(sale, currencies)` to display — it works for any row with `currencyId` + `ratePerUsdSnapshot` despite the name.
  - `customer_id` is **nullable** — walk-in sales are recorded with `customer_id = NULL`.
  - `voided_at` / `voided_by` / `void_reason` for soft-void. Voiding cascades to `sale_items` only on hard delete (FK `ON DELETE CASCADE`); a void just stamps the header. No hard delete of active sales.
- **`sale_items` (lines)** — one row per product: `sale_id`, `product_id`, `product_name_snapshot` (frozen), `quantity`, `unit_amount` (frozen, in the sale currency). `line_total = unit_amount * quantity` is **derived in the mapper** (no stored column). No own `branch_id` — RLS inherits from the parent sale (`EXISTS`), like `payments` inherit via the customer. `ON DELETE CASCADE` from `sales`; `ON DELETE RESTRICT` on `product_id` (a referenced product can't be hard-deleted).

**One currency per sale, auto-convert.** A sale freezes exactly one currency + one rate (the debt / wallet / dashboard math depends on it). The `SaleFormSheet` has a single sale-currency selector; when a product is added, its catalog price is **converted into the sale currency** at the live rate (`convert()` in `src/core/utils/currency.ts`) as the editable per-line prefill. The first product picked adopts its own currency as the sale default (until the user changes it); changing the sale currency re-prices every line from its product's catalog price. The `SaleItemsEditor` (`src/modules/transaction/sales/components/`) owns the cart rows + sale currency and reports a `SaleCartDraft` (`lines` / `total` / `currency` / `ready`) up to the form — mirroring `CustomerPlansEditor`'s add/remove-row pattern.

**Create is header-then-lines.** `SaleService.createSale` computes the summed `total_amount` + `items_summary`, then `SaleRepository.create` inserts the header, then the lines (web: sequential insert like the customer + `customer_plans` path; offline: header + all lines in one SQLite transaction, pushed parents-before-children via `SYNC_PULL_ORDER`). List/detail reads join `sale_items(*, products(*))`; the lean aggregate/label reads (`partialSales`, `unremittedForWallet`, dashboard totals) read only header columns.

**Receipt (`SaleDetailSheet`).** The product lines get their **own card**, separate from the customer / sold-at / receipt-ID rows: a "Products" header (cart icon + line count when >1), then one row per line — numbered bubble, `product_name_snapshot`, a `qty × unit price` sub-line, and the line total on the right. A totals footer (Total, plus Paid / Remaining when the sale is partial) renders only when it adds information (multi-line or partial sale). The hero's caption swaps the frozen `items_summary` for a "{{count}} products" count once there is more than one line, since the summary gets long. Lean reads (empty `items`) simply skip the card.

**Branch semantics:**

- `products.branch_id`: same as `plans` — `NULL` = SHARED catalog item visible to every branch.
- `sales.branch_id`: same as `customers` — `NULL` only when a tenant-wide admin records a walk-in without picking a branch. RLS scopes branch-scoped users to their own branch. `sale_items` has no `branch_id` — it inherits via the parent sale.

**`AsyncEntityPicker`** ([src/shared/components/AsyncEntityPicker.tsx](../SubsTrack/src/shared/components/AsyncEntityPicker.tsx)) is the reusable customer picker built for `SaleFormSheet`. Generic over `<T>`; the caller passes a `loadPage(search, page)` callback. Reuses `SearchTextBox`, `useDebounce` (300 ms), and a `requestToken` ref to discard stale responses when the user types fast (same pattern as `customerSlice.searchToken`). Use it any time the option list is too large to fit in memory — small static lists keep using `Dropdown`.

**Sales tab filters:** `SalesPanel` exposes a chip filter bar above the list — search (sale `items_summary` + customer name), customer (`CustomerPicker`), product (`Dropdown` over active products, lazy-loaded via `fetchProducts` on mount — the repo resolves "sales containing this product" from `sale_items`), and a **From/To date range** (`DatePickerInput` with `triggerStyle="chip"`, the two pickers constrain each other via `minDate`/`maxDate`). All non-search filters live on the `sales` slice (`customerFilter`, `productFilter`, `fromDate`, `toDate`) and flow into `saleService.getSales` → `SaleRepository.findAll`; date bounds are calendar days converted to `sold_at` timestamp bounds (end inclusive via next-day-exclusive). A "Clear filters" chip (visible only when ≥1 filter is active) resets them in one tap via `clearFilters`.

**Customer sales surfaces:** the customer detail screen renders `CustomerSalesPanel` at the **bottom** (below the payment grid + details card). The panel shows only a **5-sale preview**; when the customer has more it renders a "Show all" link to a dedicated full-page list (`CustomerSalesListScreen` at `customers/[id]/sales`) that mirrors the Sales tab (search + infinite scroll + record FAB + void) but is locked to one customer. Both surfaces keep their **list reads** independent of the global `sales` slice — the panel via `saleService.getSalesForCustomer` (with a stale-response token guard), the full page via the `useCustomerSalesList` hook — so neither clobbers the Sales tab's filter/search/list state. **Mutations, however, route through the global slice** so the Sales tab cache stays coherent: creates go through `SaleFormSheet` → `saleSlice.createSale` (unshift), and voids go through `saleSlice.voidSale` (drops the row from `sales.items`); each surface then refreshes its own local list. The panel additionally refreshes on focus (`useFocusEffect`) so changes made on the full page reflect on return. Neither surface applies a branch filter: they show **all** of the customer's sales regardless of the admin's current branch view.

**Dashboard:** `DashboardService.getMetrics()` parallel-fetches `sales.totalsForMonth(monthStart, monthEndExclusive, branchFilter)` alongside the payment and debt-payment queries. The Revenue card shows `monthlyRevenue = subscriptionRevenue + salesRevenue + debtRevenue`, with a breakdown sub-line (Subscriptions · Sales · Debts) listing only the non-zero streams, rendered once more than one earned. All values are summed in USD via each row's frozen `rate_per_usd_snapshot`, then formatted into the user's display currency at render.

**Revenue is CASH COLLECTED, not billed value** — one rule across all three streams. `sales.totalsForMonth` / `totalsInRange` / `monthlyTotals` sum **`amount_paid`**, never `total_amount` (a partial sale contributes only its paid part), matching `payment.paidAmountsForMonth`'s `amount_paid`. The unpaid remainder is a debt, and it enters revenue in the month it's collected, through the third stream: `debt.paidAmountsInRange` over non-voided `debt_payments.amount` by `paid_at`. So every collected unit of money is counted exactly once, and nothing collected is missing from the total. `salesCount` is still every sale row, paid or not — only the money is cash-based. Before this rule, sales counted `total_amount` (money never received) while collected debts counted nowhere at all.

**Home analytics (expanded).** `getMetrics()` also computes a richer analytics set, all branch-scoped and USD-canonical:

- **Month-over-month** — `prevMonthRevenue`; the hero card renders a ▲/▼ % pill ("vs last month") when the prior month had revenue.
- **Revenue trend** — `revenueTrend: RevenuePoint[]`, the **6 months ending on the current month**. Built by `DashboardService.getRevenueTrend(anchorYear, anchorMonth, branchFilter)` — fetches `payment.paidAmountsInRange` + `sale.totalsInRange` + `debt.paidAmountsInRange` once each for the 6-month window, then buckets rows by month into USD (per-row `rate_per_usd_snapshot`). All three (and the hero card's `paidAmountsForMonth`) scope by **when the money arrived** — `paid_at` / `sold_at`, never `billing_month` — matching the Payments tab's "This Month" grouping, so the chart's current-month bar always agrees with the hero card. This also keeps `prevMonthRevenue` (the trend's second-to-last point) on the same three streams as `monthlyRevenue`, so the ▲/▼ pill compares like with like. `getMetrics()` calls it anchored on the current month for the initial load. Rendered by `RevenueTrendChart` — a minimal in-app **stacked** vertical bar chart (no chart library): each bar splits subscription (indigo, bottom) / sales (emerald) / debt (`bg-red-500` = `COLORS.danger`, top — deliberately the same red the Debts tab uses, so the stream is recognizable across screens), one bar per month, current month emphasized; subscriptions absorb the rounding so the segments always sum to the bar height, and the legend only lists the streams present in the window. **Navigable** — prev/next chevrons in the chart header, or a horizontal swipe anywhere on the card (`useHorizontalSwipe`, the same hook the payment grid's year swipe uses — it frames the flick as forward/back in reading order, so RTL needs no extra work), page the window 6 months at a time via the dashboard slice's `navigateTrend('prev' | 'next')`, which re-fetches through `getRevenueTrend` and tracks the visible window in `trend`/`trendAnchor` (kept separate from `metrics.revenueTrend` so paging the chart doesn't touch the rest of the dashboard); "next" is disabled once the window reaches the current month. Month labels add a 2-digit year suffix only when the visible window spans more than one calendar year.
- **Growth this month** — `newCustomersThisMonth` / `cancelledThisMonth` via `customer.countCreatedInRange` / `countCancelledInRange` (by `created_at` / `cancelled_at`, `[monthStart, monthEndExclusive)`).
- **Activity this month** — `paymentsCollectedCount` (positive-amount rows in `paidAmountsForMonth`, scoped by `paid_at`) and `salesCount` (`totalsForMonth` row count). The screen derives **avg payment** = `subscriptionRevenue / paymentsCollectedCount`, shown as the "Payments" tile sub-line.
- **Total debt tile** — the one figure on the dashboard that is **all-time, not month-scoped** (it answers "how much is still outside", which has no month). `totalDebt` is the **net** still owed, straight from `debtService.getDebtsView().summary.netUsd` — the same number as the Debts tab header. Its sub-line is `dashboard.debt_breakdown` = gross `monthsDebt` + gross `salesDebt`. **Known and accepted:** those two are gross (before debt payments) and skip the `custom` + `services` categories, so they don't sum to the net headline — they can read *larger* than it. A reconciling version (all categories + a "Paid −X" term) was built and then **deliberately reverted** at the owner's request; don't re-introduce it without asking.
  - `totalDebt` **also appears inside the purple hero card** as a red-tinted chip (`bg-red-400/20`, matching the card's decline pill) prefixed with a minus — `Owed by customers −$383.00` — shown only when `totalDebt > 0`. It sits below the revenue breakdown and above the divider. The tint + minus are load-bearing: everything else in that card is money **collected**, so the one figure that is money **not** collected has to read as an outflow at a glance. The tile below keeps the reconciling category breakdown; the chip is the glance-value.
  - The hero's revenue breakdown lists **Subscriptions and Sales only** — collected debts are deliberately **not** shown there (owner's call: the card's one debt figure should be what's still owed, so two debt numbers can never sit side by side again). `debtRevenue` still counts inside the big `monthlyRevenue` number and still gets its own red segment in the trend chart — it's hidden from the breakdown, not dropped from the maths. **Consequence to keep in mind:** in a month with collected debts, `subscriptionRevenue + salesRevenue < monthlyRevenue`, and the gap is exactly `debtRevenue`. That's intended; don't "fix" it by re-adding the column without asking.
  - So the card carries **money in** (big number + streams) and **money out** (the red chip) together, and they never mix: collecting a debt raises the total and lowers the chip.

Presentation: the screen uses a shared `StatTile` (label / big value / sub-line / tone / optional icon) for the stat grid (Active, Unpaid, New, Cancelled, Payments, Sales) and the total-debt money tile. Every repo range query has a Supabase + Offline SQLite implementation behind the `IPaymentRepository` / `ISaleRepository` / `ICustomerRepository` / `IDebtRepository` seam.

**Tier-gating** is sale-blind: products consume a slot (gated by `max_products`), but recording sales is unlimited on every tier. Stock is not gated at all — restocking is unlimited.

### Stock

Every product carries a stock quantity and can be **out of stock**. Stock on hand is **computed at runtime** — `Product.stockOnHand = SUM(stock_movements.quantity_delta)` over the non-voided rows — exactly like Debts and the Collector Wallet. There is deliberately **no counter column on `products`**: the offline sync pushes whole rows with latest-`updated_at`-wins, so two devices each selling one unit offline would both write the same decremented number and one sale would vanish. Additive ledger rows merge with no conflict.

**`stock_movements`** — `product_id`, signed `quantity_delta` (never 0), `reason`, `sale_id` (only for `'sale'`), `note`, `recorded_by_user_id`, `occurred_at`, plus soft-void fields. Reasons:

| Reason | Written by | Sign |
| --- | --- | --- |
| `initial` | the "Starting stock" field on **product create** | + |
| `restock` | the product's stock sheet, "Add" — or the **batch restock** sheet | + |
| `adjustment` | the product's stock sheet, "Remove" (damage, miscount) | − |
| `sale` | `SaleService.createSale`, one row per line | − |

**Reading it.** Web reads the `product_stock` view — `SUM(quantity_delta) … WHERE voided_at IS NULL GROUP BY product_id, tenant_id`, declared `WITH (security_invoker = true)` so the caller's RLS on `stock_movements` still applies (**requires PG 15+**; without `security_invoker` the view runs as its owner and leaks every tenant's stock). Offline runs the same `GROUP BY` on the mirror — there is no local view. Both are `IProductRepository.stockOnHand(ids?)` returning `Record<productId, number>`; products with no movements are absent and default to 0. `ProductService.getProducts` folds the map into each `Product`.

**Branch scoping is inherited from the PRODUCT, not the sale.** The `stock_movements_all` policy mirrors `products_select` (`current_branch_id() IS NULL OR p.branch_id IS NULL OR p.branch_id = current_branch_id()`) — **not** `sale_items_all`, which inherits `sales`' *owned* semantics. Copying `sale_items_all` would hide every SHARED product's movements from a branch-scoped user, so each shared product would read as permanently out of stock and be unsellable for them. A shared product has **one** stock pool across all branches. The `WITH CHECK` also allows shared products (unlike `products_modify`): a branch user who can *sell* a shared item must be able to write its movement.

**Writing it.**

- **Sale create** — `SaleService.createSale` builds one negative `'sale'` movement per line and passes them in `CreateSalePayload.movements`. The repository writes them alongside the header + lines (offline: the *same* transaction), so a sale can never exist without the stock it consumed.
- **Sale void** — the sale's movements are **soft-voided** (`UPDATE … WHERE sale_id = ? AND voided_at IS NULL`), not reversed with opposite rows. One statement, independent of line count, and idempotent — a repeat void is a no-op instead of returning the stock twice. Bulk void inherits this for free (`saleSlice.voidSales` loops `saleService.voidSale`).
- **Manual** — `ProductService.adjustStock` appends a single `restock` / `adjustment` row. Rows are never edited or deleted; a mistake is corrected with another movement.
- **Batch restock** — `ProductService.restockMany(entries, tenantId, note, userId)` appends one `restock` row **per product** in a single `addMovements` call (offline: one transaction), then returns the fresh on-hand map so `productSlice.batchRestock` updates the list without a refetch. One arriving delivery = one save, but the per-product history stays exactly as detailed as the one-at-a-time path — there is no "batch" reason and no grouping row. The shared note is copied onto every row.

**Blocking.** `SaleService.createSale` calls `assertStockAvailable` after `validate()` — a **fresh** `stockOnHand` read (the store can be minutes stale), summing the requested quantity **per product across all cart lines** (the same product can sit on two rows). Throws `errors.sale_out_of_stock` / `errors.sale_insufficient_stock`. Because it lives in the service, every entry point is covered (sale form, quick actions, customer screens). `SaleItemsEditor` mirrors it as a soft guard: out-of-stock products stay listed but greyed via `DropdownOption.disabled`, the quantity stepper caps at *on-hand minus what other rows already took*, each row shows "N left", and an oversold cart reports `ready: false`. The check is **advisory** — two offline devices can still each sell the last unit, and the DB deliberately allows a negative total (gotcha #48).

**UI.** `ProductCard` shows a green "N in stock" / red "Out of stock" / red "Short by N" chip. `ProductStockSheet` (product row menu → "Adjust Stock", or the link on the edit form) shows the current on-hand, an Add/Remove toggle, a quantity + note, and the last 20 movements as a bordered list: a reason icon tinted by direction (green adds / red removes), the reason, date **and** time (`formatDateTime`), who recorded it (resolved from the users slice via `recordedByUserId`), the note, and a "Reversed" chip with struck-through amount on voided rows. `ProductFormSheet` takes "Starting stock" on **create only**; on edit it renders the number read-only next to an "Adjust Stock" link, so the total is never free-typed.

`ProductBatchRestockSheet` is the many-products counterpart: a search box, then every **active** product as one compact row — name, current on-hand, and a `[−] qty [+]` stepper. A row with a quantity turns indigo and previews the result (`3 → 8`), so what's included is visible without reordering the list while the user types. One shared note applies to every row, and a summary line ("N products selected · +40") sits above the save button. Quantities are held per product id, so filtering the list never loses what was already typed. Two entry points, one component: the **Restock** button beside the search box on the products screen, and **Batch Restock** in the PageHeader quick-actions menu (admin-only there, since products live in the admin tab that non-admins never see).

See gotchas #35, #36, #37, #48.

---

## Transactions Hub

The bottom **Transactions** tab (`app/(app)/(tabs)/transactions`) is a hub hosting three in-page segments via the shared `SegmentedTabs` control: **Debts** (default), **Sales**, and **Services** (placeholder). `TransactionsScreen` owns the page chrome (SafeAreaView + title + `BranchSelector` + segments); each segment is a self-contained **panel** that owns its own body (filters, list, sheets, multi-select) but not the chrome. The selection toolbar that used to live inside `PageHeader` was extracted into a shared `SelectionBar` so panels (which have no `PageHeader`) can render it; `PageHeader` re-uses `SelectionBar` and re-exports `SelectionAction` for back-compat. While a panel is in selection mode it **replaces its filter row** with the single `SelectionBar` (see the shared selection row below).

- **Debts** → `DebtsPanel` (see the [Debts](#debts) section — `debts` slice).
- **Sales** → `SalesPanel` (the former `SalesListScreen` body, behavior unchanged — `sales` slice).
- **Services** → `ServicesPanel` ("coming soon" `EmptyState`).

> **Payments history is no longer a Transactions tab.** The `PaymentsPanel` body was moved into a full-height bottom sheet (`PaymentsHistorySheet`, in `customer-payments/components/`) launched from the **PageHeader 3-dot quick-actions menu** ("Payments history", first item) on any screen. It rides the same `ui`-slice / `QuickActionSheets` seam as the other quick-add sheets (`QuickActionSheet` gained `'paymentsHistory'`). The panel itself, its `paymentsList` slice, filters, and multi-select are unchanged — only where it's hosted moved.

**Month-grouped lists.** Sales, Payments, and Debts all render as a `SectionList` grouped by calendar month, newest first — one section header per month ("This Month" for the current month, else "June 2026"). The two newest buckets break out ahead of the months: **Today** (`common.today`) and **This Week** (`common.this_week`, Monday-based week start, excluding today) — a row lands in exactly one bucket (today → this week → its month). The grouping is a pure view transform (`groupByMonth` in [monthSections.ts](../SubsTrack/src/shared/lib/monthSections.ts)) over the **already date-desc-sorted** slice data, so the slice/service stays the single source of sort order — it only buckets, it never re-sorts. Day/week bucket totals are always summed locally (their newest rows are guaranteed loaded); a month whose newest rows were peeled into Today/This-Week has that peeled USD subtracted from its authoritative `totalsByMonth` total so the header still reads the correct remainder. Each panel supplies the row's date: Sales → `soldAt`, Payments → `paidAt`, Debts item → `date` (billing month / sold / incurred), Debts payment → `paidAt`. Headers render via the shared `MonthSectionHeader`; sticky headers are disabled. Selection / select-all still resolve against the flat slice array (the sections are built from it), so multi-select is unaffected. Full month names come from the `months_long` i18n block; "This Month" from `common.current_month`.
  - **Month totals.** Each panel also passes `groupByMonth` a `getAmountUsd` row-to-USD function, so every section carries a `totalUsd`; `MonthSectionHeader` renders it (formatted into the display currency) at the trailing edge of the header, next to the row count. Sales/Payments sum **amount collected** (`amountPaid / ratePerUsdSnapshot`, matching what the section groups by — `soldAt`/`paidAt`). (Debts no longer uses month sections — it's a flat debtors list; the debtor detail modal groups a customer's debts/payments via the shared `DebtList`.)
    - **Sales/Payments are paginated (`PAGE_SIZE` = 30) — summing only the loaded rows would under-count any month with more rows than one page.** Both panels instead pass `groupByMonth` a 5th arg, `totalsByMonth: Record<"YYYY-MM", number>`, which — for any month key present — overrides the local per-row sum. That map comes from `saleSlice`/`paymentsListSlice`'s `monthlyTotals` state, refetched (in parallel with the paginated page) every time filters change via `SaleService.getMonthlyTotals` / `PaymentService.getMonthlyTotals`, which bucket `SaleRepository.monthlyTotals` / `PaymentRepository.monthlyTotals` — the **same filters as `findAll`, but unpaginated and projected to just the 2–3 numeric columns needed to sum** (no joins beyond what a search/branch filter needs), so it stays cheap even over a whole table. `fetchMoreSales`/`fetchMorePayments` (loading further pages of an unchanged filter set) do **not** refetch it — the total doesn't change, only which rows are visible. Debts isn't paginated (it loads its full filtered set up front), so it never passes this arg and keeps summing locally.

**Payments list (tenant-wide):** previously payments were viewable only per-customer via the month grid. `PaymentsPanel` lists **settled** payments (`amount_paid > 0`, non-voided) across all customers, defaulting to those **recorded in the last month** (`paid_at` within `[one month ago, today]`). Backed by its own `paymentsList` slice + `PaymentRepository.findAll` + `PaymentService.getPayments` (returns `PaymentListItem` = `Payment` + joined `customerName`); the recording staff name is resolved client-side from the `users` slice. Filter chips: **Customer** (`CustomerPicker`), **Collected by** (`Dropdown` over users), **From** + **To** (day-granular `DatePickerInput` → `YYYY-MM-DD`, defaulting to one month ago and today) + **For month** (`DatePickerInput` `monthOnly` mode → `YYYY-MM-01`), and **Status** (all / paid / partial). `paidFrom`/`paidTo` filter `paid_at` to the inclusive day range (`>= dayStart(from)`, `< nextDayStart(to)`); `billingMonth` is an exact `billing_month` match; status maps to `balance` (0 = paid, >0 = partial). Branch scoping reuses the inherited `customers.branch_id` filter. "Clear filters" resets to the last-month default. Tapping a row opens the existing `PaymentDetailSheet` (wrapped in a synthetic `MonthEntry`, with the customer name shown) wired to **void** (`PaymentListVoidSheet` → `paymentsList.voidPayments`) and **edit** (`paymentsList.updatePayment`, re-snapshots FX on currency change). Multi-select enables bulk void. The per-customer `paymentSlice` and month-grid logic are untouched.

---

## Debts

The **Debts** segment of the Transactions hub is a per-customer accounts-receivable view. It answers *"how much does this customer still owe me, across everything?"*

**Core model — debts are computed at runtime, not stored.** A customer's net debt is
`net = Σ(all category debts) − Σ(debt payments)`. Categories:

| Category   | Source (derived / stored)                                        |
| ---------- | ---------------------------------------------------------------- |
| `months`   | Partial subscription `payments` — `balance > 0` (derived).       |
| `sales`    | Partial `sales` — `total_amount − amount_paid > 0` (derived).    |
| `services` | Reserved for the future Services feature — contributes 0 today.  |
| `custom`   | Hand-typed rows in the `custom_debts` table (stored).            |

Only the two sources **without** a source transaction are stored: `custom_debts` (hand-typed debts) and `debt_payments`. A **debt payment** is tied **only to the customer** — it does NOT modify the underlying payment/sale row; it only offsets the runtime total. **Guard:** `DebtService.addDebtPayment` blocks a payment when the customer's net debt is ≤0 (`errors.debt_payment_no_debt`) and caps the amount at the net owed, compared in USD via the entered currency's rate (`errors.debt_payment_exceeds_debt`, tiny epsilon so paying the exact remaining works). This is service-layer, so every entry point (the tab FAB, the row "Pay" action, the customer-card/detail sheets) is covered. `DebtPaymentFormSheet` additionally previews the owed amount (`debts.owes_label`) when a customer is picked, shows a no-debt notice, and disables submit / flags an over-cap amount before the round-trip. So a partial month still shows "partial" in the month grid after its debt is paid off; only the Debts total drops. This is intentional (the user's chosen model).

**Layers.** New `debts` module (`src/modules/debts/`): `DebtRepository` (+ `.offline`, platform switch) owns only `custom_debts` + `debt_payments` CRUD/reads; `DebtService` **composes** existing services for the derived categories — `paymentService.getPartialPayments(branchFilter)` (added: partial payments across all months) and `saleService.getPartialSales(branchFilter)` (added: partial sales) — plus the debt repo, and folds everything into a uniform `DebtItem[]` view-model + a USD `DebtSummary` (this is the `DashboardService` fan-out precedent). Aggregation is done **once in the service** (each repo returns filtered raw rows) so the web + offline SQLite repos stay behaviorally identical; USD conversion uses each row's frozen `rate_per_usd_snapshot` (`sumUsd`, same as `DashboardService.sumInUsd`), then the screen formats into the display currency.

**Sales gained `amount_paid`.** A sale can now be recorded partially paid (`SaleFormSheet` reuses `PaymentAmountPaidSection`, default **Full**). Partial is only offered when a customer is selected — a walk-in sale has no debtor. Legacy sales backfill to `amount_paid = total` (fully paid, no phantom debt).

**UI (`DebtsPanel`).** A **single debtors list** (the old Debtors / Debts / Payments sub-tabs were removed). A **net-total summary header** sits on top (`Σ debts − Σ payments`; negative = **Credit**), branch-wide. Below it a name search, then one `DebtorCard` per customer who still owes money (net > ~1¢), sorted most-owed first (built client-side by `groupDebtors`). The **FAB** opens an `ActionMenu`: *Add custom debt* / *Record debt payment* (picker-driven, not pre-scoped). No tier gating (recording debts/payments is unlimited).

- **Debtor detail** — tapping a `DebtorCard` opens `DebtorDetailSheet`, a `pageSheet` modal with the customer's name + net and the shared `DebtList`: their debts and debt payments **merged into one newest-first list ordered by date** (`DebtItem.date` / `DebtPayment.paidAt`) — the same interleaving as `DebtHistorySheet`, not two separate sections. The modal is **interactive** — a header **"+" menu** (`ActionMenu`: *Add custom debt* / *Record debt payment*, pre-scoped to this customer via `CustomDebtFormSheet` / `DebtPaymentFormSheet`) plus the panel's **Pay** / void row handlers, so you can add, collect, or reverse right there. All mutations go through the global `debts` slice and re-fetch; the modal's rows re-derive from the slice, so it updates live.
- **Pay** on a debt row records a debt payment equal to `remaining` in the row's own currency via `addDebtPayment` (drops the net; never touches the underlying payment/sale); custom rows also get **Remove** (soft-void). Months/sales rows stay informational (void the underlying payment/sale in their own hub tab).
- The debtor row's own 3-dot `ActionMenu` has **Pay full debt** (one debt payment equal to the whole net, in USD).
- **Debt history** — a **clock icon** (`time-outline`) on the net-total summary card opens `DebtHistorySheet`: a **read-only, branch-wide activity log** merging every outstanding debt **and** every debt payment into one newest-first list, bucketed into month sections (Today / This Week / This Month / `<Month> <Year>`) via the shared `groupByMonth` + `MonthSectionHeader` — the same month grouping the Payments/Sales tabs use. Each month header shows that month's **net** change in USD (a debt adds, a payment subtracts, so the total can be negative). It reuses the slice's already-loaded `items` + `payments` (no re-fetch) and reuses `DebtItemCard` / `DebtPaymentCard` (customer name shown, no row actions). This restores the removed Debts / Payments sub-tabs as a single combined, read-only sheet.

**State.** `debts` slice (`src/state/slices/debts/`) holds `items` / `payments` / `netByCustomer` (+ legacy `customerFilter` / `categoryFilter` fields that the single-tab panel no longer drives; `summary` is not stored — it's derived). `fetchDebts` calls `debtService.getDebtsView({ branchFilter })` — the **full branch dataset**; the debtors grouping (`groupDebtors`), name search, and net summary (`sumDebtNetUsd`) are all done **client-side** in the panel, so no extra fetch is needed. `fetchDebts` self-bumps `searchToken` (last-write-wins across concurrent fetches). Add/void actions re-fetch. Read via `useDebtSlice`.

**Customer-list debt flag.** The customer card shows a **Debt** badge (net amount) for any customer who still owes money. It's fed by `debts.netByCustomer` — a `Record<customerId, netUsd>` (positive nets only) built by `debtService.getNetUsdByCustomer(branchFilter)`, which reuses `getDebtsView` (unscoped) and folds `Σ debts − Σ payments` per customer in USD via each row's frozen snapshot rate. The `CustomerListScreen` fetches it on mount / branch-change / focus / pull-to-refresh (via `fetchNetByCustomer`, whose failure is swallowed so it never breaks the list), and the debt mutations (`addCustomDebt` / `addDebtPayment` / `voidCustomDebt` / `voidDebtPayment`) refresh it too. The screen formats each net into the user's display currency. The card layout: the flags sit on **their own right-aligned line at the top** — the status pill (inactive / non-regular / paid / partial / unpaid) and the **debt** pill side by side; below them the usual card design — customer **name (left) with the month/date on the same line at the right**, then plan, then phone.

**Customer-detail "Transactions" panel.** The customer detail screen renders `CustomerDebtsPanel` (below `CustomerSalesPanel`) — a section titled **Transactions** that lists this customer's outstanding debts (partial months / partial sales / custom) grouped above their debt payments, with the net still-owed figure (or **Credit**) in the header. It reads **independently** from the global `debts` slice via `debtService.getDebtsView({ customerId })` (not branch-scoped — shows all the customer's debts), refreshing on focus — the same isolation pattern as `CustomerSalesPanel`. The list body is the shared **`DebtList`** component (the two labeled sections built on `DebtItemCard` / `DebtPaymentCard` with `hideCustomerName`) rendered with no row action callbacks (read-only rows). The header carries a **"+" menu** (`ActionMenu`: *Add custom debt* / *Record debt payment*, pre-scoped to this customer via `CustomDebtFormSheet` / `DebtPaymentFormSheet`); those sheets route through the global `debts` slice and `onCreated` re-`refresh()`es the panel.

**Customer quick actions.** The customer-list card's 3-dot menu also offers **Record Sale** / **Add custom debt** / **Record debt payment** (`SaleFormSheet` / `CustomDebtFormSheet` / `DebtPaymentFormSheet`, each pre-scoped to that customer). These sheets are imported by **direct component path** (not the module barrels) to avoid a customers↔debts/sales barrel import cycle; the list refreshes `netByCustomer` after a sale so the debt badge stays current.

**Global quick-actions menu (PageHeader 3-dot).** Every screen's `PageHeader` shows a top-right 3-dot (`ellipsis-vertical`) button that opens an `ActionMenu` of app-wide "quick add" shortcuts — **Add customer / Record sale / Add custom debt / Record debt payment** — none pre-scoped (each sheet opens standalone with its own customer picker / walk-in). It's a tiny UI-only global-store seam mirroring `confirm`: the menu items only flip the generic `ui` slice (`src/state/slices/ui/` — the home for ephemeral cross-screen UI state; `openQuickAction` / `closeQuickAction`, `openSheet: 'customer' | 'sale' | 'customDebt' | 'debtPayment' | null`), and the four form sheets are hosted **once** by `QuickActionSheets` (`src/modules/quick-actions/`, mounted next to `GlobalConfirmDialog` in `app/(app)/_layout.tsx`). This keeps `PageHeader` free of module imports (it only reads the slice); the sheets self-update their own slices on create. Pass `hideQuickActions` to `PageHeader` to suppress it on a screen. Only these four are included because they all support a standalone form; subscription payments (`PaymentFormSheet`) need month-grid context and stay screen-local.

**Offline.** `custom_debts` + `debt_payments` are synced tenant tables (registered in `db/tables.ts` + `SYNC_PULL_ORDER`); both inherit their branch from the customer (RLS `EXISTS`, offline joins `customers`). See [docs/offline.md](offline.md) for the sync-registration + the `sales.amount_paid` migration detail.

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

**Not payable — the user must unskip first.** There is no "pay anyway":

- Tapping a skipped cell opens the **unskip** confirmation (checked *before* the inactive/cancelled gate, since unskipping is not a payment).
- The `?quickPay=1` deep link from the customer list shows `payments.skip.pay_blocked` instead of the form.
- Every other pay path filters on `status === 'unpaid' || 'future'`, so the new status excludes itself: `canQuickPay`, `payableEntries`, and `isPayable` in `monthSelection.ts`.
- A **multi-month block** covering a skipped month is refused whole (`assertNoSkippedMonths` → `errors.months_skipped`) — the block covers consecutive months and cannot leave a hole.

**Nothing is owed, so nothing counts it.** Two paths had to learn the rule:

| Path | Behavior |
| --- | --- |
| `PaymentService.buildCustomerStatus` | Everything the customer list shows comes from here, off `buildMonthGrid` — so a skipped month simply never resolves to `unpaid` and cannot make a customer overdue. A skipped line also drops out of the "N/M plans paid" tally (`total`) and doesn't block "paid". When `total` falls to **0** (every started line skipped), `status` is `"skipped"`. |
| `CustomerRepository.countUnpaidForMonth` (web + offline) | The dashboard's `unpaidThisMonth` skips those lines. |

**Customer-list badge.** `status === "skipped"` means the customer owes nothing this month because **every** started active line is skipped. The card shows a slate **"Skipped"** pill and the list's **Unpaid** tab leaves them out. A customer with one skipped and one unpaid line is still `"unpaid"` — only *all* lines skipped counts. Older unpaid months are the separate `overdue` flag and show as their own red pill beside the slate one, so a skipped month never hides real debt.

**`coveredLineIds` was renamed `notDueLineIds`** (now `CustomerStatus.notDueLineIds`) because it means "must not be quick-paid this month" — already covered by a payment **or** skipped. `CustomerListScreen`'s `eligibleFixedLines` / `hasUnpaidStartedLine` read it per customer, so "Collect all due" leaves skipped lines alone.

**UI.** `SkipMonthSheet` (a `ConfirmDialog`, like `VoidSheet`) handles both directions: skipping takes the optional note, unskipping echoes back the note it was skipped with. Entry points: the month cell's 3-dot menu (**Skip month** on unpaid/future, **Unskip month** on skipped), a tap on a skipped cell, and the grid's **multi-select** toolbar — a selection can hold both kinds, so *Skip* and *Unskip* appear together and each acts on its own subset. A skipped cell's selection unit is always just itself (never part of a payable block). The year card shows a **"N skipped"** chip next to paid/unpaid when the year has any.

**Offline.** `skipped_months` is a synced tenant table (`db/tables.ts` + `SYNC_PULL_ORDER`, right after `payments`) with a local `UNIQUE (customer_plan_id, billing_month)`. Writes go through `upsertNaturalKeyDirty` — the generalization of the old `upsertPaymentDirty` — and the id is `deterministicId('skip', customer_plan_id, billing_month)`, prefixed so it can't collide with the payment id built from the same pair. Push uses the natural key as the conflict target (`conflictTarget` in `sync.ts`), so two devices skipping the same month converge.

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
- **`customer_plans`** (a **service line**) — one plan the customer is on, with its **own** `start_date`, `cancelled_at`, and `active`. `plan_id` may be NULL for a custom/occasional line.
- **`payments`** — link to a line via `customer_plan_id`; uniqueness is `UNIQUE(customer_plan_id, billing_month)`, so each line is paid separately for the same month. `plan_id` stays as the price snapshot.

**Layers.** New `customer-plans` module (repository / service / mapper) mirrors `plans`. The thin `customerPlans` slice exposes `syncLines(customerId, lines, removed, reactivated, tenantId)` (which applies the customer form's inline Plans editor) plus `hasPayments(lineId)` (does a line have any recorded payments — drives the remove-plan prompt). `removed` is a `RemovedLine[]` (`{ id, hardDelete }`); `reactivated` is a plain `string[]` of cancelled line ids brought back to active (they also appear as active drafts in `lines`, so they ride the upsert path — a reactivated id makes its update also flip `active`/`cancelled_at`). `CustomerPlanService.syncLines` runs removals + create/updates **concurrently**, **skips kept lines whose plan + start date are unchanged** (no round-trip — but never skips a reactivation), and **returns the resulting lines** (`{ active, cancelled }` — `active` includes reactivated lines). The slice rebuilds the owning customer's `customerPlans` **locally** via `customers.setCustomerLines` (active result + soft-cancelled removals + previously-cancelled lines kept for history, minus anything reactivated or hard-deleted) — **no `fetchCustomer` re-fetch** — so the grids built from them re-render. The edit path is therefore one round-trip when nothing about the plans changed (the customer update already returns fresh lines), instead of update → per-line write → re-fetch.

**Managing plans — in the customer form.** Add / change / remove / reactivate plans happens **inline in `CustomerFormSheet`** (create AND edit): a "Plans" section lists one row per line — each row is the **plan dropdown + an inline start-date picker + a delete button on one line** — plus an "Add plan" button (minimum one *active* row — a plan-less row records custom amounts). The start date is editable per line; new rows default to the customer's start date. On save, the form creates/updates the customer then calls `syncLines`. **Remove** = hard-delete a line with no payments, else the prompt below. **Cancelled lines stay visible** in the editor (dimmed, read-only, with a "Cancelled" badge and a **Reactivate** button). Every customer ends up with ≥1 active line.

**Removing a plan that has payments — keep vs delete-permanently prompt.** When the trash icon is tapped on an existing active line, the editor first asks the slice `hasPayments(lineId)`. If the line has recorded payments, a **confirm dialog with a checkbox** appears (`RemovePlanChoice`): *"Delete permanently"*. Unchecked (default) → the line is only **soft-cancelled** (`active = false`), its payments untouched, and its row stays in the editor as a cancelled row you can reactivate. Checked → `CustomerPlanService.deleteLine(id, hardDelete=true)` calls `repository.delete(id)`, which **hard-deletes the line and cascade-deletes all its payments** (FK `ON DELETE CASCADE`) — the row disappears. This hard delete is an **intentional exception to rule #7** (no hard deletes); the dialog copy warns it can't be undone. Backing out of the dialog keeps the plan active. A line with no payments still removes silently (hard-delete). The checkbox rides inside the shared `confirm()` dialog via its `content?: () => ReactNode` option — a render callback kept **outside** immer state (like `pendingResolve`) and read back through `confirm.getContent()`; the checkbox owns its own state and reports the value through a closure ref the editor reads after the promise settles.

**Reactivating a cancelled plan.** Pressing **Reactivate** on a cancelled row flips it back to active (and its fields editable). If the line was soft-cancelled *in the same editing session* (still pending in `removed`), the two cancel out — the removal is simply dropped, no DB call. Otherwise the id goes into `reactivated`. On save the row is a normal active draft (`getLines` includes it), so it flows through `syncLines`' **single upsert path** as an update that **also re-activates** it (`CustomerPlanService.updateLine(id, draft, reactivate=true)` → `repository.update` with `active = true, cancelled_at = null` alongside plan/date — one write, so any edits made after reactivating are saved too). It deliberately does **not** run a separate reactivation write: doing both once double-listed the line in the locally-rebuilt `customerPlans` (a transient duplicate until the next fetch). Payments were never touched by a soft-cancel, so nothing else is restored.

**Month grid.** `PaymentService.buildMonthGrid(customerPlan, payments, skips, year)` builds **one grid per line** (payments pre-scoped to the line, boundary = `line.startDate`). The payment slice keeps `monthGridsByLine` keyed by line id; the algorithm is otherwise unchanged (rule #1).

**Customer detail (tabbed, view-only selector).** `CustomerPaymentPanel` shows a **line selector** (tabs) above the year card; one line's grid at a time. A single-line customer auto-selects it and hides the selector, so it looks exactly like before. Cancelled lines stay visible (dimmed) for history. The selector does **not** add/edit/remove lines — that's the customer form's job. Pay / void actions are scoped to the selected line and pass `line.id` as `customerPlanId`. Each tab carries a small **status dot** derived from that line's viewed-year grid (`lineIndicatorStatus`, worst-state-wins: unpaid=red > paid=green; a partial payment reports as paid; no dot when nothing is due yet) — reusing the grid statuses already in `monthGridsByLine`, so it re-derives per year as you navigate and matches the grid/summary-chip colors.

**Payments on a cancelled plan (or inactive customer).** A cancelled line stays **payable for its PAST + CURRENT months** (record via form, quick-pay, and bulk-pay all work); only **calendar-future** months are blocked (a "Not available" dialog: `payments.cancelled_plan_future_blocked`, or `payments.inactive_future_blocked` when the whole customer is inactive — customer-inactive takes priority). This is one shared gate in `CustomerPaymentPanel` — `isPayBlocked(entry) = (!customer.active || !lineActive) && isCalendarFuture(entry)` — used by `handleCellPress`, `canQuickPay`, and the `payableEntries` bulk filter, so all three paths agree. Note **calendar**-future (year/month strictly after now) — the current month is always payable. `PaymentFormSheet.blockedForInactive` uses the same rule, so an opened form on a past/current cancelled month submits normally.

**Aggregation across lines.** Customer-list status is aggregated over a customer's **active** lines by `PaymentService.buildCustomerStatus` (the single implementation — see CLAUDE.md → Customer-List Status): `"paid"` (green) only when every DUE line has a covering payment for the current month (a **partial** payment counts as covered — its remainder is a debt, not an unsettled month), and a separate `overdue` flag (its own red pill) when any active line has an *earlier* unpaid month. A **skipped** line, and under the `customer_start_day` rule a line whose billing day hasn't arrived, are not due at all: they neither count nor block, and a customer whose lines are *all* in that state reads "Skipped" / "Not due yet" rather than unpaid. Under the default `month_start` rule there is **no grace period**: the current month counts as unpaid from day 1 on both the card and the grid, so the two always agree (gotcha #34).

**"N/M plans paid" badge (multi-plan).** A customer with **2+ due plans where some are paid this month and some are not** is `status === "mixed"` and gets its own amber badge — e.g. **"1/2 plans paid"** — instead of the plain red "Unpaid", so a partly-paid account is never confused with a fully-unpaid one. The tally is `CustomerStatus.planCount { paid, total }` where `total` = lines actually DUE this month and `paid` = lines settled this month (grid status `paid`). `total` excludes lines that are `before_start`, **skipped**, or not-due-yet under the `customer_start_day` rule. **One** code path computes it — `PaymentService.buildCustomerStatus` — for both the bulk load (`getCustomerStatuses`) and the post-pay/void patch (`syncCustomerStatus` in the slice), so there is nothing to keep in lockstep. A partially-paid line counts toward `paid` (a partial payment reports as `paid`), so a single-plan customer who paid partially reads as fully **paid** (green) — the remaining amount shows only on the Debts tab.

**Not-due-line tracking (quick-pay eligibility).** Alongside the tally, `CustomerStatus` carries **`notDueLineIds`** — the service-line ids that must not be quick-paid this month: they already have a covering (non-voided) payment, full or partial, **or** the month is skipped on that line. A line that is merely *not due yet* under the `customer_start_day` rule is deliberately **absent**, so paying early stays possible. It is per customer (no global `Set`), refreshed with the rest of the map by `fetchCustomerStatuses` and patched by `syncCustomerStatus` after a local pay/void. Quick pay skips any line in it, so a **mixed** multi-plan customer pays only its still-due plans and never re-pays a line (the payments `createMany` upsert would otherwise overwrite the existing row and reset its remittance). The list's void-this-month path refreshes the whole map afterwards so freed lines become quick-payable again.

**Collect all due.** Customer-list Quick Pay (single or bulk) pays **every eligible fixed-price line still unpaid this month** in one batch via `bulkPayCustomers` (one `BulkPayCustomerRequest` per line; already-covered lines are filtered out by `currentMonthCoveredLineIds`). Custom-price / plan-less customers fall back to the detail form. The Transactions → Payments rows show the plan name so a customer's lines are distinguishable.

**Card 3-dot menu labels (single vs multi).** The quick-pay and void rows are worded by how many plans are in play this month (started active lines): a **single-plan** customer shows plain **"Quick pay"** / **"Void current month"** (with the plain "Void Payment?" confirm); a **multi-plan** customer shows **"Quick pay unpaid plans"** / **"Void paid plans"** (with the "Void paid plans?" confirm that spells out voiding every plan paid this month + whole multi-month bundles). Quick pay appears whenever any started plan is still unpaid — so a mixed customer shows **both** rows at once. Keys: `payments.quick_pay.menu_label` / `payments.quick_pay.pay_unpaid_plans`, `payments.void_current_month` / `payments.void_paid_plans`.

See gotchas #1, #16, #25, #41.

---

## Payment Scenarios

| Scenario        | Condition                                                  | Amount field                                                                        |
| --------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| A — Fixed       | Line's plan exists, `isCustomPrice = false`, `durationMonths = 1` | Pre-filled with `plan.price`, read-only                                      |
| B — Override    | Same as A, user toggles override                           | Radio: "Plan price" or "Custom amount"                                              |
| C — Custom      | `isCustomPrice = true`, or no plan                         | Amount input required, no default                                                   |
| D — Multi-month | Plan exists, `isCustomPrice = false`, `durationMonths > 1` | Pre-filled with `plan.price` (bundle), read-only; calls `createMultiMonthPayment()` |

**Full vs Partial** is decided in the `PaymentAmountPaidSection` at the bottom of the form, just above the submit button. Default is Full → `amount_paid = amount_due`. Partial reveals a single Amount Paid input locked to the resolved currency; the Amount Due is always derived from the upper section (plan price for A/D, plan or custom for B, custom for C).

**A partial payment looks paid; the remainder is a debt.** When `amount_paid < amount_due`, the month + customer read as **paid** (green) — there is no distinct "partial" month status (see [gotchas.md](gotchas.md) → Payments and CLAUDE.md → Month Grid). The outstanding `balance` is surfaced only through the **Debts** tab ("months" category, `balance > 0`) and the drill-in receipt (`PaymentDetailSheet`) / Payments-tab ledger (`PaymentListCard`), which read `payment.balance` directly. The partial input shows an inline amber notice (`payments.partial_debt_notice`) telling the user the remaining amount will be added to the customer's debts. (`PaymentAmountPaidSection` is shared with `SaleFormSheet`, where the same notice covers partial sales.) The third mode, **Debt (unpaid)** → `amount_paid = 0`, records the charge with nothing collected: the month stays **unpaid** and the full amount is a debt.

Payments are **never re-recorded**, but the **Edit Payment** action on the receipt sheet can update `amount_due`, `amount_paid`, and `currency_id` in place via `PaymentService.updatePayment()`. Editing re-snapshots `rate_per_usd_snapshot` from the (possibly newly chosen) currency's live rate at edit time — the "user fixing the record" semantic. Voided payments remain locked. Wholesale corrections (changing `duration_months`, or restoring a voided payment) still require void + re-record.

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

**Bulk quick pay** pays every eligible customer in **one DB round-trip** via `paymentSlice.bulkPayCustomers` → `PaymentService.bulkPayCustomers` → `PaymentRepository.createMany` (one `upsert`). Selected customers are partitioned in the screen: eligible fixed-price → **paid** (single + multi-month, each at its own plan price/currency for the current month — multi-month plans become a block covering `plan.durationMonths`); custom-price/no-plan → **skipped**; ineligible (inactive / non-regular / already paid / before start) → silently dropped. A confirm dialog always shows, warning how many multi-month customers will be charged for their full duration and how many custom-plan customers are skipped (info dialog with `hideCancel` when nothing is payable). The batch is **all-or-nothing** (single upsert): the service asserts multi-month tier once when any multi-month is present, then `createMany`; on failure the slice records `error`/`tierLimitError` and returns `0`. The action skips the per-customer `items`/`monthGrid` rebuild (that's customer-detail state) and only syncs the current-month badge sets, so the list never touches another customer's loaded payments. The screen surfaces a partial/total failure (`payable.length − paidCount`) as a `bulkNotice` `ErrorBanner`. The single-tap path keeps the no-UI core `payCustomerQuick(customer)` (single-month → `createPayment`; multi-month → `createMultiMonthPayment` with `skipConflicts = false`); single-selection quick-pay calls the existing `handleQuickPay` (so a lone custom-price customer still routes to the manual form). **Bulk delete** is a real batch via `customerSlice.bulkDeleteCustomers` → `CustomerService.deleteManyCustomers` → one `customersWithPayments` query + parallel `deactivateMany`/`deleteMany` (see the batch-delete note under [Multi-Select & Bulk Actions](#multi-select--bulk-actions)); the slice adjusts `activeCount` by however many deleted rows were active. A lone selection still reuses the single-item `handleDeleteCustomer` confirm.

**Rolled out to every list screen.** The same pattern now lives in Products, Plans, Users, Branches, Currencies, and both Sales lists. Each card (`ProductCard`/`PlanCard`/`UserCard`/`BranchCard`/`CurrencyCard`/`SaleCard`) gained the four optional props + `<Checkbox>` swap; each screen wires `useSelection()` + `useSelectionBackHandler()`, resolves selected ids against its **visible** list, passes `selection={…}` to its `<PageHeader>`, and hides search/FAB while selecting. Toolbar actions are count-dependent — **1 selected:** edit (+ the row's state toggle: deactivate/reactivate for branches/currencies, reactivate for inactive products, activate/deactivate for manageable users); **all counts:** the destructive verb.

**Bulk delete is a real batch — never a per-row loop.** Each module has a `deleteMany`/`bulkDelete*` chain: `repository.deleteMany(ids)` / `deactivateMany(ids)` are single `.in('id', ids)` statements, and the service partitions ids into hard vs soft via one reference query (the shared `BaseRepository.referencedIdsIn(table, column, ids)` helper). So a bulk delete of N rows is **≤3 round-trips total, independent of N** (resolve references → one batch soft-update + one batch hard-delete in parallel) instead of N×(count + delete). The service returns the `{ hard, soft }` id split; the `bulkDelete*` slice action applies it to `items` (remove hard, flip soft to `active:false`) and refreshes usage — no refetch. Failures surface through the slice's normal `error` banner (the batch is effectively all-or-nothing, so there's no partial "X of Y" notice for deletes). Soft/hard rule per module mirrors the single delete: **products** (sales ref), **currencies** (plan/payment ref), **branches** (user/customer/plan ref, plus the "≥1 active branch must survive" guard via `countActiveAmong`), **customers** (payment ref → soft sets `cancelled_at`, hard cascades payments), **plans** (always hard — assigned customers fall back via `ON DELETE SET NULL`).

- **Users** are the one partial exception: a single `delete-user` **edge function** removes the auth user, so hard deletes can't collapse to one SQL statement. `UserService.deleteUsers` still batches everything it can — one `usersWithPayments` lookup, one `setActiveMany` soft-delete — and only the auth hard-deletes run as parallel edge calls. Permission is enforced per id (`checkToggleActivePermission`); the screen pre-filters via `canManage` (own account / role hierarchy) and reports skipped rows (`users.bulk_delete_skipped` / `bulk_delete_none`).
- **Sales** (no edit, destructive = **void with a shared reason**): the toolbar's single "void" action opens [`SaleBulkVoidSheet`](../SubsTrack/src/modules/sales/components/SaleBulkVoidSheet.tsx) (a `ConfirmDialog` + reason `TextInput`, mirroring `BulkVoidSheet`). It calls `saleSlice.voidSales(ids, voidedBy, reason)` — a per-row loop over `saleService.voidSale` (voiding is an audit-logged single-row mutation, not a batchable delete) that drops voided rows and returns `{ ok, failed }`. A total failure keeps the dialog open with the error; any success closes it and reports counts via `common.bulk_void_summary`. `CustomerSalesListScreen` reuses the same sheet but `refresh()`es its customer-scoped `useCustomerSalesList` afterwards (voids route through the global slice so the Sales tab's cache also drops the row).

### Month-grid bulk actions

The month grid on the customer detail screen has its own selection mode (same `useSelection()` hook, distinct from the customer list — it acts on one customer's months, not on customers). Wired in [`CustomerPaymentPanel.tsx`](../SubsTrack/src/modules/customer-payments/components/CustomerPaymentPanel.tsx); selection keyed by `billingMonth`.

- **Entry/exit:** long-press a non-`before_start` cell enters selection; tap toggles; the per-cell 3-dot menu hides; toolbar X / Android back / emptying / **year change** / unmount exit. `before_start` cells are inert.
- **Toolbar placement:** a `GridSelectionToolbar` (`X · "N selected" · [Pay] [Void]`) renders as an **absolute overlay over the year-header row** (inside a `relative` wrapper, `bg-white`), directly above the grid — not in the page header (unlike the customer list). It overlays rather than inserting into the flow **on purpose**: pushing the grid down mid-long-press would shift cells under the user's finger and toggle the wrong month on release. Pay shows when ≥1 selected month is payable, Void when ≥1 is voidable; a mixed selection shows **both**, each acting only on its eligible subset.
- **Cell visual:** selected cells gain a `border-2 border-primary` ring plus a filled check-circle badge (where the 3-dot sits); selectable-unselected cells show an empty circle. Status colour stays visible.
- **Auto-expand unit** ([`utils/monthSelection.ts`](../SubsTrack/src/modules/customer-payments/utils/monthSelection.ts) `expandSelectionUnit`): a cell backed by a live payment selects **every visible month sharing that `payment.id`** (whole block, for voiding); a multi-month-plan payable cell selects its **start-aligned N-month window**; otherwise just the cell. Windows are anchored at the customer's `startDate` month via absolute month index, so they never overlap and never start before the start date.
- **Pay** branches on `customer.plan` (one plan per customer): *fixed single-month* → confirm then `createPayment` full price per month; *custom / no plan* → `BulkPaymentFormSheet` collects one amount (due + full/partial + currency) applied to every selected month; *multi-month* → `groupPayableBlocks` collapses the selection to distinct block starts, one `createMultiMonthPayment(..., skipConflicts = true)` each (already-paid months inside a window are skipped). **Void** dedupes the voidable subset by `payment.id` → `BulkVoidSheet` (ConfirmDialog + optional reason) voids each once.
- **Loops are sequential** (same `loadingCreate`/`loadingVoid` early-return constraint as the customer list); per-iteration `getStore().getState().payments` checks aggregate ok/failed into an amber `bulkNotice` banner on partial failure. Multi-month with a missing/disallowing tier counts as failed (the service `assertMultiMonth` gate).

---

## Audit Trail

An **append-only** record of who changed what, when, and what the value was before. It exists because nothing remembered the old value: `payments.amount_paid` can be edited and the original figure was simply gone — the exact fact an admin-vs-staff dispute turns on.

**The app writes the trail, NEVER a Postgres trigger.** A trigger only fires when the row reaches Postgres, which for an offline device is at the **next sync** — it would stamp the sync moment and the syncing session instead of the real action and the real person, and a device that never synced would hold no history at all. So each repository writes its own audit row alongside the change. (This is why §9.1 of `new-features.md` originally said "triggers, no app code" — that note predates the offline-first layer.)

**What one row stores** — the `audit_logs` table: `tenant_id`, `branch_id` (denormalized from the row or its parent; NULL = tenant-wide record), `table_name`, `record_id`, `action` (`create` | `update` | `delete` | `void` | `restore`, CHECK-constrained), `before_data` / `after_data` / `changed` (JSONB), `label`, `actor_user_id`, `actor_username`, `occurred_at`, `created_at`, `updated_at`.

- An **edit keeps only the changed columns** — `changed` is the list of column names, `before_data`/`after_data` hold just those columns' old/new values (~150 bytes). Each entry is therefore self-contained and readable without hunting for the previous one. A **create** stores the whole new row in `after_data`; a **delete** the whole removed row in `before_data`.
- `updated_at` and the generated `balance` are **excluded from the diff**, so a form saved untouched writes nothing at all (`buildAuditRow` returns `null`).
- `actor_username` is a **snapshot**, so the trail still names the person after their user row is deleted.
- `label` is a **frozen one-liner** built by `describeAudit(table, row)` from the row's **own** columns only — a name pulled off another table would dangle once that row is deleted (same reasoning as `sales.items_summary`).
- `occurred_at` is the **device clock** — when the staff member acted, not when the row synced. Never sort or display the trail by `updated_at` (that is the server clock and the sync cursor).
- `branch_id` deliberately carries **no foreign key**: every other table uses `ON DELETE SET NULL`, which here would blank the trail when a branch is deleted. Evidence must outlive the branch. (`tenant_id` cascades, `actor_user_id` sets null.)
- Four indexes: `(tenant_id, occurred_at DESC)`, `(table_name, record_id, occurred_at DESC)`, `(actor_user_id, occurred_at DESC)`, and `(updated_at)` for the pull cursor.

**RLS — three policies, and one deliberate absence:**

- `audit_logs_select` — **admins only** (reuses the `tenant_settings_write` role test), branch-aware via the row's own `branch_id`.
- `audit_logs_insert` — **every** tenant member: a staff device must be able to push its own trail even though it can never read one back.
- **No UPDATE and no DELETE policy, on purpose** — append-only from the client; only `service_role` can rewrite or purge (the same "absence of a policy = service_role only" idiom as `app_options`).
- Consequence worth knowing, not a bug: a staff device's pull returns no audit rows, so its local table only ever holds its own un-pushed ones.

**Audited tables** (`AUDITED_TABLES` in `src/modules/admin/audit/utils/constants.ts`) — 14: `payments`, `sales`, `custom_debts`, `debt_payments`, `customers`, `customer_plans`, `skipped_months`, `plans`, `products`, `branches`, `currencies`, `users`, `tenant_settings`, `tenants`.

**Deliberately not audited:** `sale_items` (no independent life — the parent sale covers it, and its `items_summary` is already frozen there) and `stock_movements` (already an append-only ledger with actor, note and its own history UI — auditing it would duplicate itself). Also out: the log tables themselves (`exception_logs`, `audit_logs`) and `app_options` / `tier_plans`, which this app never writes (`scope: 'global'`).

**Writing it — one line per call site:**

- `BaseRepository.audit(input)` (web/online) — **never throws**: a failed audit insert must not fail the user's save.
- `OfflineBaseRepository.auditIn(db, input)` (native) — called **inside the caller's `write()` transaction**, so the change and its trail commit or roll back together. A failure here **does** propagate; rolling back is the correct outcome.
- `auditedUpdate()` / `auditedDelete()` on both base classes wrap the repeated read-patch-diff dance. `branchColumn: null` marks a table with no branch dimension; `branchColumn: 'id'` is for `branches`, which *are* a branch.
- Builders live in `src/core/audit/`: `buildAuditRow.ts` (diff + actor/tenant/timestamps, `null` when nothing changed) and `describe.ts` (the `label`). The actor is read through a **lazy `require`** of the global store — same require-cycle reason and shape as `src/core/errorLog/errorLogger.ts`; a top-level store import from a file `BaseRepository` imports would crash.

**Reading it** (`src/modules/admin/audit/`) — `IAuditRepository` is **read-only**; writes come from each repository, never through it.

- `findRecent` reads the **local 30-day window**, so it works offline. `findAll` and a record's `full` timeline are **online-only on native** (`throw new RequiresConnectionError()`, else delegate to the Supabase sibling — the same pattern as `SubscriptionRepository.offline.upgradeTenant`).
- Ordered by `occurred_at DESC`, never `updated_at`.
- `auditPageSize(scope)` exists because the local window pages at `OFFLINE_PAGE_SIZE` (100) while every Supabase query pages at `PAGE_SIZE` (30) — a hardcoded `PAGE_SIZE` would make the native list stop after one page.

**UI** — **Admin → Audit Log** (`app/(app)/(tabs)/admin/audit.tsx`): filter chips (record type / action / staff / date range), a day-ordered list, tap for a field-by-field *before → new* diff sheet, and a "Load full history" action that flips the scope from local to server. Plus a per-record **History** action on `PaymentDetailSheet` (admin-only, mirroring the read policy) opening `RecordHistorySheet`.

A third entry point is the **customer** trail: `CustomerHistorySheet` (`modules/customer/customers/components/`), opened from the customer card's quick-actions menu **and** a History row on `CustomerDetailsCard`. It merges the customer row with **every one of its service lines** into one newest-first timeline, so "renamed → moved branch → a plan was cancelled" reads as one story. That needs a multi-record read: `IAuditRepository.findForRecords(targets, full)` takes explicit `(table, recordId)` pairs, because the trail stores **no parent link** — an entry knows only its own table and record id. Both impls match pairs as an OR of `(table AND id)` terms; **two separate `IN`s would cross-match**, accepting a plan line's id under `table_name = 'customers'`.

Deliberately **not** in the customer sheet: payments, sales and debts (a busy customer has hundreds — they would bury the profile edits, and payments already have their own per-record History), and **skipped months** — a skip's id is a hash of `(customer_plan_id, billing_month)`, so it cannot be enumerated without querying every month; skips remain visible in the month grid and the main Audit Log.

Unlike the Audit Log tab, the customer sheet is offered to **every role**, since staff use these two screens constantly. A non-admin's `audit_logs_select` returns no rows, so the sheet shows an explicit "Admins only" state — never an empty list, which would read as the false claim "this customer was never changed".

Both admin views render the same **`<HistoryList>`** (`components/HistoryList.tsx`) — a purely presentational list (entries + loading/error/scope in, `onLoadMore` / `onLoadFull` / `onRefresh` out) that owns no query state, so it can be pointed at any filter. `inSheet` picks Gorhom's `BottomSheetFlatList` over RN's (a plain `FlatList` cannot scroll inside a sheet). Reuse it for any new "history of X" view rather than rebuilding the list, scope note and detail-sheet plumbing.

**Where the read state lives is split by lifetime**, and the split matters:

| State | Home | Why |
| --- | --- | --- |
| The admin screen's filter session + paging (`tableFilter`, `actorFilter`, `from`/`to`, `scope`, `page`, `hasMore`) | the **`audit` slice** (`useAuditSlice`), registered in `globalStore.ts`, reset in `storeReset.ts`, refreshed in `refreshActiveData.ts` | must survive navigating into an entry and back, and **must** be cleared on logout so a previous tenant's entries can never surface |
| One record's timeline in a History sheet | the **`useRecordHistory(table, recordId)`** hook, local to the sheet | per-record and transient; in the store it needed a second parallel set of fields (`recordItems`/`recordLoading`/`recordError`) that two open sheets would overwrite, plus a manual clear on close. Unmounting the sheet now discards it, and the hook carries a stale-response guard the slice version lacked |

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

A **collector wallet** is the cash a user (any role) has collected but **not yet handed over** to an admin. Like Debts, it is **computed at runtime — never stored as a balance**. The only new persistence is two columns on the three cash tables (`payments`, `sales`, `debt_payments`): `remitted_at` / `remitted_by` (set together; NULL = still in the collector's wallet). No new table.

**What counts as a collector's cash** — every non-voided, **unremitted** (`remitted_at IS NULL`) row they recorded, across the three cash sources:

- `payments.amount_paid` (subscription), collector = `received_by_user_id`
- `sales.amount_paid` (one-off sale — the **cash collected**, not `total_amount`), collector = `recorded_by_user_id`
- `debt_payments.amount` (money against a customer's debt), collector = `received_by_user_id`

`custom_debts` are **excluded** — a custom debt is money *owed to the business*, not cash a collector holds.

**Per-currency + USD.** A collector may hold several currencies at once. `WalletService` groups a collector's items by currency (`WalletCurrencyTotal` = the raw physical cash in that currency **plus** its USD value) and sums everything in USD via each row's frozen `rate_per_usd_snapshot` (drift-free, the same principle as `DebtService`/`DashboardService`). The admin list shows one USD headline per collector (formatted into the display currency); the detail shows the per-currency breakdown when more than one currency is involved.

**Per-transaction settle, multi-select, + "receive all".** An admin opens a collector and either:

- taps **Receive** on a single transaction (`WalletService.receiveItems([one])`), or
- **long-presses to multi-select** several transactions, then taps **Receive** in the selection bar to hand them over together (`WalletService.receiveItems([…])`), or
- taps **Receive all** to empty the whole wallet at once (`WalletService.receiveAllFromCollector`, which re-reads the collector's current unremitted set first so it never acts on a stale list).

Both stamp `remitted_at`/`remitted_by` on the source rows — the cash leaves the wallet. Marking is **admin-only**, enforced in `WalletService.assertAdmin` (app-layer, matching the codebase convention that RLS only does tenant/branch isolation).

**Detail-view transaction list.** `WalletDetailView` (shared by the admin detail sheet and the read-only self-view) shows each transaction as a card with the **customer** as the primary line (walk-in sales show "Walk-in"), a secondary `type · descriptor · date` line (date via the app's standard `formatDate`), and the cash amount. It carries client-side **filters** — customer (the distinct customers present in this wallet), payment type (subscription / sale / debt payment), and a from/to **date range** — that narrow only the list, never the headline total. Multi-select + the receive actions are hidden in the read-only self-view; filters remain available there. `WalletItem` now carries `customerId` / `customerName`, and its `label` is the secondary descriptor (plan for a subscription, product for a sale, `null` for a debt payment). The sale's customer name comes free from the existing `customers(*)` join (`sale.customer`, hydrated on web + offline).

**Self-correcting.** Because the wallet is derived, voiding or editing a source payment/sale/debt-payment flows straight through on the next fetch. A void + re-pay of a month **resets** `remitted_at` to NULL (the re-recorded cash is fresh, unremitted) — handled in the payment upsert's reset block. If money was already handed over and the source row is later voided, the collector's total can go **negative** (the business now owes them) — this is correct and simply shows as a negative USD figure.

**Where it lives.**

- Admin: **Admin → Wallets** (`app/(app)/(tabs)/admin/wallets.tsx` → `WalletsScreen`) — list of collectors holding cash, tap → detail sheet with the transactions + receive actions.
- Every user: **Settings → My Wallet** (`app/(app)/(tabs)/settings/my-wallet.tsx` → `MyWalletScreen`) — a read-only view of their own cash-on-hand (no receive actions).
- Dashboard (**admin-only**): a **Cash in Wallets** tile summarises the branch's uncollected cash — the net USD total (formatted into the display currency) with a `{collectors} · {transactions}` sub-line. Shown only when the total is > 0. `DashboardService.getMetrics(branchFilter, includeWallet)` folds `walletService.getWalletsView(branchFilter)` into `walletCash` / `walletCollectors` / `walletTransactions` on `DashboardMetrics`; the dashboard slice passes `includeWallet = isAdmin`, so a non-admin's dashboard neither computes nor surfaces it.

**Code map.** `src/modules/wallet/` (`services/WalletService.ts`, `screens/`, `components/WalletDetailView.tsx` + `CollectorWalletCard.tsx`), slice `src/state/slices/wallet/walletSlice.ts` (hook `useWalletSlice`). The three cash services each gained `getUnremittedForWallet(...)` + a mark method (`PaymentService.markRemitted`, `SaleService.markRemitted`, `DebtService.markDebtPaymentsRemitted`), backed by `unremittedForWallet` / `markRemitted` on their repositories (web + offline). Types (`WalletItem` / `WalletCurrencyTotal` / `CollectorWallet` / `CollectorWalletDetail` / `WalletSource`) live in `src/core/types`.

**Historical data.** On launch, existing collected rows all have `remitted_at = NULL`, so **every past transaction counts** toward wallets immediately (the chosen behavior — no start-date cutoff, no opening handover). Admins clear the historical backlog with a one-time "receive all" per collector.
