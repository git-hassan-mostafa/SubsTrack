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
- [Subscription Tiers](#subscription-tiers)
- [Products & One-Off Sales](#products--one-off-sales)
- [Transactions Hub](#transactions-hub)
- [Debts](#debts)
- [Regular Customer](#regular-customer)
- [Multiple Plans per Customer (service lines)](#multiple-plans-per-customer-service-lines)
- [Payment Scenarios](#payment-scenarios)
- [Multi-Select & Bulk Actions](#multi-select--bulk-actions)
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

- CustomerFormSheet: Branch picker only shown to tenant-wide admins. Branch-scoped users auto-assign their own branch. The plan dropdown filters to `branch_id IS NULL OR branch_id = selected_branch`.
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

LoginScreen also exposes "Create a new workspace" → signupSlice (2-step form):
  Step 1 (SignupWorkspaceScreen)
    → signupSlice.validateAndCheckCode()
    → SignupService.validateWorkspace() + repo.isTenantCodeAvailable()
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
- `AllowSelfServiceSignup` (`'true'`/`'false'`, default true) — when `false`, the login screen hides the "Create workspace" button **and** the `create-tenant` edge function rejects signups (`403`, `code: signup_disabled`) — server-side is authoritative.
- `SupportWhatsAppNumber` — support WhatsApp number (international format, digits only) used by the upgrade WhatsApp deep-link.

- **RLS:** `app_options_select` grants `SELECT` to **`anon` + `authenticated`** (anon is required because some flags gate pre-auth UI, e.g. self-service signup on the login screen). There is **no** write policy, so only the **service role** (SuperAdmin app + the `create-tenant` edge function) can insert/update/delete — RLS bypass is the write path.
- **SuperAdmin** owns full CRUD via the **Options** tab ([app/(tabs)/options.tsx](<../SuperAdmin/app/(tabs)/options.tsx>) → `OptionsScreen`). The `options` module mirrors `tier-plans` (repository + service + standalone `optionStore` + screen + `OptionFormSheet`) but adds create + delete. The option **key is immutable after creation** (only `value` + `description` are editable), so well-known keys can't be renamed out from under the code that reads them.
- **SubsTrack** has a **read-only** `options` module (repository `findAll`/`findByKey` + `OptionService.getOptions`/`getOptionValue` + `optionSlice` + `useOptionSlice`). It never writes. Options are fetched **at app bootstrap** (`app/_layout.tsx`, so the pre-auth login screen can read flags) and re-primed on login/restore via `primePostAuth`; they are intentionally **not** reset on `logout`. Reference keys through `OPTION_KEYS`, never magic strings. Read values through the typed selector hooks in [useOptionSlice.ts](../SubsTrack/src/state/hooks/useOptionSlice.ts): generic `useOptionValue(key)` / `useBooleanOption(key, fallback)`, and semantic `useCanUpgradePlan()` / `useSelfServiceSignupEnabled()` / `useSupportWhatsAppNumber()`. For **conditional UI**, prefer the declarative gate components in [FeatureGate.tsx](../SubsTrack/src/shared/components/FeatureGate.tsx) — `<CanUpgrade fallback={…}>` and `<CanCreateWorkspace>` — which wrap the gated element and render `children` when enabled, else `fallback`; this keeps flag ternaries out of the screens. WhatsApp deep-links go through `openWhatsApp()` in [shared/lib/whatsapp.ts](../SubsTrack/src/shared/lib/whatsapp.ts).

See gotcha #38.

---

## Subscription Tiers

Every tenant lives on one of three global `tier_plans` rows: **Free**, **Pro**, **Business**. The catalog is small and fixed (3 rows seeded by `script.sql`, editable by the SaaS owner via SuperAdmin's tier-plans module). Each tier defines numeric limits (`max_customers`, `max_users`, `max_plans`, `max_branches`, `max_currencies` — NULL means unlimited), feature flags (`multi_currency_enabled`, `multi_month_plans_enabled`), `grace_days` (drives the month grid), and a USD monthly price.

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

**Products** mirror `plans` exactly: per-tenant catalog, optional currency, `branch_id IS NULL` = SHARED, soft-delete via `active = false` when a product has historical sales (hard-delete otherwise — mirrors `CurrencyService.deleteCurrency`). Tier-gated through `tier_plans.max_products` (Free: 5, Pro/Business: unlimited).

**Sales** are a one-off ledger with snapshots throughout (gotcha #21 generalizes here):

- `product_name_snapshot` — frozen product name at sale time, survives product renames/soft-deletes.
- `unit_amount` — per-unit price at sale time. Defaults to `product.price` in the form but is editable (discounts, rounding).
- `total_amount` — `GENERATED ALWAYS AS (unit_amount * quantity) STORED`, read-only.
- `rate_per_usd_snapshot` — currency rate at sale time, same drift-free principle as `payments.rate_per_usd_snapshot`. Use `paymentSnapshotCurrency(sale, currencies)` to display — it works for any row with `currencyId` + `ratePerUsdSnapshot` despite the name.
- `customer_id` is **nullable** — walk-in sales are recorded with `customer_id = NULL`.
- `voided_at` / `voided_by` / `void_reason` for soft-void. Voided sales drop out of the active list but remain in the DB. No hard delete.

**Branch semantics:**

- `products.branch_id`: same as `plans` — `NULL` = SHARED catalog item visible to every branch.
- `sales.branch_id`: same as `customers` — `NULL` only when a tenant-wide admin records a walk-in without picking a branch. RLS scopes branch-scoped users to their own branch.

**`AsyncEntityPicker`** ([src/shared/components/AsyncEntityPicker.tsx](../SubsTrack/src/shared/components/AsyncEntityPicker.tsx)) is the reusable customer picker built for `SaleFormSheet`. Generic over `<T>`; the caller passes a `loadPage(search, page)` callback. Reuses `SearchTextBox`, `useDebounce` (300 ms), and a `requestToken` ref to discard stale responses when the user types fast (same pattern as `customerSlice.searchToken`). Use it any time the option list is too large to fit in memory — small static lists keep using `Dropdown`.

**Sales tab filters:** `SalesPanel` exposes a chip filter bar above the list — search (product name snapshot + customer name), customer (`CustomerPicker`), product (`Dropdown` over active products, lazy-loaded via `fetchProducts` on mount), and a **From/To date range** (`DatePickerInput` with `triggerStyle="chip"`, the two pickers constrain each other via `minDate`/`maxDate`). All non-search filters live on the `sales` slice (`customerFilter`, `productFilter`, `fromDate`, `toDate`) and flow into `saleService.getSales` → `SaleRepository.findAll`; date bounds are calendar days converted to `sold_at` timestamp bounds (end inclusive via next-day-exclusive). A "Clear filters" chip (visible only when ≥1 filter is active) resets them in one tap via `clearFilters`.

**Customer sales surfaces:** the customer detail screen renders `CustomerSalesPanel` at the **bottom** (below the payment grid + details card). The panel shows only a **5-sale preview**; when the customer has more it renders a "Show all" link to a dedicated full-page list (`CustomerSalesListScreen` at `customers/[id]/sales`) that mirrors the Sales tab (search + infinite scroll + record FAB + void) but is locked to one customer. Both surfaces keep their **list reads** independent of the global `sales` slice — the panel via `saleService.getSalesForCustomer` (with a stale-response token guard), the full page via the `useCustomerSalesList` hook — so neither clobbers the Sales tab's filter/search/list state. **Mutations, however, route through the global slice** so the Sales tab cache stays coherent: creates go through `SaleFormSheet` → `saleSlice.createSale` (unshift), and voids go through `saleSlice.voidSale` (drops the row from `sales.items`); each surface then refreshes its own local list. The panel additionally refreshes on focus (`useFocusEffect`) so changes made on the full page reflect on return. Neither surface applies a branch filter: they show **all** of the customer's sales regardless of the admin's current branch view.

**Dashboard:** `DashboardService.getMetrics()` parallel-fetches `sales.totalsForMonth(monthStart, monthEndExclusive, branchFilter)` alongside the existing payment queries. The Revenue card on the home dashboard shows `monthlyRevenue = subscriptionRevenue + salesRevenue`, with a sub-line "Subscriptions: $X · Sales: $Y" rendered when `salesRevenue > 0`. All values are summed in USD via each row's frozen `rate_per_usd_snapshot`, then formatted into the user's display currency at render.

**Home analytics (expanded).** `getMetrics()` also computes a richer analytics set, all branch-scoped and USD-canonical:

- **Month-over-month** — `prevMonthRevenue`; the hero card renders a ▲/▼ % pill ("vs last month") when the prior month had revenue.
- **Revenue trend** — `revenueTrend: RevenuePoint[]`, the **6 months ending on the current month**. Built by `DashboardService.getRevenueTrend(anchorYear, anchorMonth, branchFilter)` — fetches `payment.paidAmountsInRange(startIso, endExclusiveIso)` + `sale.totalsInRange(startIso, endExclusiveIso)` once each for the 6-month window, then buckets rows by month into USD (per-row `rate_per_usd_snapshot`). Both queries (and the hero card's `paidAmountsForMonth`) scope payments by **`paid_at`** (when the payment was recorded) — matching the Payments tab's "This Month" grouping — not `billing_month`, so the chart's current-month bar always agrees with the hero card's "Subscriptions" figure. `getMetrics()` calls it anchored on the current month for the initial load; `prevMonthRevenue` is simply the trend's second-to-last point. Rendered by `RevenueTrendChart` — a minimal in-app **stacked** vertical bar chart (no chart library): each bar splits subscription (indigo, bottom) vs sales (emerald, top), one bar per month, current month emphasized. **Navigable** — prev/next chevrons in the chart header page the window 6 months at a time via the dashboard slice's `navigateTrend('prev' | 'next')`, which re-fetches through `getRevenueTrend` and tracks the visible window in `trend`/`trendAnchor` (kept separate from `metrics.revenueTrend` so paging the chart doesn't touch the rest of the dashboard); "next" is disabled once the window reaches the current month. Month labels add a 2-digit year suffix only when the visible window spans more than one calendar year.
- **Growth this month** — `newCustomersThisMonth` / `cancelledThisMonth` via `customer.countCreatedInRange` / `countCancelledInRange` (by `created_at` / `cancelled_at`, `[monthStart, monthEndExclusive)`).
- **Activity this month** — `paymentsCollectedCount` (positive-amount rows in `paidAmountsForMonth`, scoped by `paid_at`) and `salesCount` (`totalsForMonth` row count). The screen derives **avg payment** = `subscriptionRevenue / paymentsCollectedCount`, shown as the "Payments" tile sub-line.

Presentation: the screen uses a shared `StatTile` (label / big value / sub-line / tone / optional icon) for the stat grid (Active, Unpaid, New, Cancelled, Payments, Sales) and the Outstanding-balance money tile. The three new repo range queries each have a Supabase + Offline SQLite implementation behind the `IPaymentRepository` / `ISaleRepository` / `ICustomerRepository` seam.

**Tier-gating** is sale-blind: products consume a slot (gated by `max_products`), but recording sales is unlimited on every tier.

See gotchas #35, #36, #37.

---

## Transactions Hub

The bottom **Transactions** tab (`app/(app)/(tabs)/transactions`) is a hub hosting four in-page segments via the shared `SegmentedTabs` control: **Sales**, **Payments**, **Debts**, and **Services** (placeholder). `TransactionsScreen` owns the page chrome (SafeAreaView + title + `BranchSelector` + segments); each segment is a self-contained **panel** that owns its own body (filters, list, sheets, multi-select) but not the chrome. The selection toolbar that used to live inside `PageHeader` was extracted into a shared `SelectionBar` so panels (which have no `PageHeader`) can render it; `PageHeader` re-uses `SelectionBar` and re-exports `SelectionAction` for back-compat.

- **Sales** → `SalesPanel` (the former `SalesListScreen` body, behavior unchanged — `sales` slice).
- **Payments** → `PaymentsPanel` (see below).
- **Debts** → `DebtsPanel` (see the [Debts](#debts) section — `debts` slice).
- **Services** → `ServicesPanel` ("coming soon" `EmptyState`).

**Month-grouped lists.** Sales, Payments, and Debts all render as a `SectionList` grouped by calendar month, newest first — one section header per month ("This Month" for the current month, else "June 2026"). The grouping is a pure view transform (`groupByMonth` in [monthSections.ts](../SubsTrack/src/shared/lib/monthSections.ts)) over the **already date-desc-sorted** slice data, so the slice/service stays the single source of sort order — it only buckets, it never re-sorts. Each panel supplies the row's date: Sales → `soldAt`, Payments → `paidAt`, Debts item → `date` (billing month / sold / incurred), Debts payment → `paidAt`. Headers render via the shared `MonthSectionHeader`; sticky headers are disabled. Selection / select-all still resolve against the flat slice array (the sections are built from it), so multi-select is unaffected. Full month names come from the `months_long` i18n block; "This Month" from `common.current_month`.
  - **Month totals.** Each panel also passes `groupByMonth` a `getAmountUsd` row-to-USD function, so every section carries a `totalUsd`; `MonthSectionHeader` renders it (formatted into the display currency) at the trailing edge of the header, next to the row count. Sales/Payments sum **amount collected** (`amountPaid / ratePerUsdSnapshot`, matching what the section groups by — `soldAt`/`paidAt`). Debts sums whatever rows are currently visible: `remaining` for the Debts sub-tab's debt items, `amount` for the Payments sub-tab's debt-payment rows.
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

Only the two sources **without** a source transaction are stored: `custom_debts` (hand-typed debts) and `debt_payments`. A **debt payment** is tied **only to the customer** — it does NOT modify the underlying payment/sale row; it only offsets the runtime total. So a partial month still shows "partial" in the month grid after its debt is paid off; only the Debts total drops. This is intentional (the user's chosen model).

**Layers.** New `debts` module (`src/modules/debts/`): `DebtRepository` (+ `.offline`, platform switch) owns only `custom_debts` + `debt_payments` CRUD/reads; `DebtService` **composes** existing services for the derived categories — `paymentService.getPartialPayments(branchFilter)` (added: partial payments across all months) and `saleService.getPartialSales(branchFilter)` (added: partial sales) — plus the debt repo, and folds everything into a uniform `DebtItem[]` view-model + a USD `DebtSummary` (this is the `DashboardService` fan-out precedent). Aggregation is done **once in the service** (each repo returns filtered raw rows) so the web + offline SQLite repos stay behaviorally identical; USD conversion uses each row's frozen `rate_per_usd_snapshot` (`sumUsd`, same as `DashboardService.sumInUsd`), then the screen formats into the display currency.

**Sales gained `amount_paid`.** A sale can now be recorded partially paid (`SaleFormSheet` reuses `PaymentAmountPaidSection`, default **Full**). Partial is only offered when a customer is selected — a walk-in sale has no debtor. Legacy sales backfill to `amount_paid = total` (fully paid, no phantom debt).

**UI (`DebtsPanel`).** Three **sub-tabs** (via the shared `PillTabs` dark-pill row — visually distinct from the hub's `SegmentedTabs` so the two nested levels read clearly): **Debtors** / **Debts** / **Payments**. A **net-total summary header** sits above all three (`Σ debts − Σ payments`; negative = **Credit**) — branch-wide on Debtors, customer-scoped on the other two (the category chip never affects the header). The **FAB** (all tabs) opens an `ActionMenu`: *Add custom debt* / *Record debt payment*. No tier gating (recording debts/payments is unlimited).

- **Debtors** — one `DebtorCard` per customer who still owes money (net > ~1¢), sorted most-owed first (built client-side by `groupDebtors`). Tapping opens `DebtorDetailSheet` — a `pageSheet` modal with the customer's name + net and the shared `DebtList` (their debts + debt payments). The modal is **interactive**: it wires the panel's **Pay** / void handlers, so you can collect or reverse right there (mutations re-fetch, and the modal's rows re-derive from the slice, so it updates live).
- **Debts** — a month-grouped `SectionList` of debt items (partial month / partial sale / custom), each row = customer · label · category badge · remaining. Filter chips: **Category** (`Dropdown`: All / Months / Sales / Custom) + **Customer** (`CustomerPicker`) — both client-side now. Each row's 3-dot `ActionMenu` has **Pay** (records a debt payment equal to `remaining` in the row's own currency via `addDebtPayment`, dropping the net; never touches the underlying payment/sale); custom rows also get **Remove** (soft-void). Months/sales rows stay informational (void the underlying payment/sale in their own tab).
- **Payments** — a month-grouped `SectionList` of the debt-payment rows (voidable by tapping). Filter chip: **Customer** only.

**State.** `debts` slice (`src/state/slices/debts/`) holds `items` / `payments` / `netByCustomer` / filters (`summary` is no longer stored — it's derived). `fetchDebts` calls `debtService.getDebtsView({ branchFilter })` — the **full branch dataset**; customer + category filtering and the net summary are all done **client-side** in the panel (`sumDebtNetUsd`), so `setCustomerFilter` / `clearFilters` are synchronous (no re-fetch) and the Debtors overview + modal need no extra fetch. `fetchDebts` self-bumps `searchToken` (last-write-wins across concurrent fetches). Add/void actions re-fetch. Read via `useDebtSlice`.

**Customer-list debt flag.** The customer card shows a **Debt** badge (net amount) for any customer who still owes money. It's fed by `debts.netByCustomer` — a `Record<customerId, netUsd>` (positive nets only) built by `debtService.getNetUsdByCustomer(branchFilter)`, which reuses `getDebtsView` (unscoped) and folds `Σ debts − Σ payments` per customer in USD via each row's frozen snapshot rate. The `CustomerListScreen` fetches it on mount / branch-change / focus / pull-to-refresh (via `fetchNetByCustomer`, whose failure is swallowed so it never breaks the list), and the debt mutations (`addCustomDebt` / `addDebtPayment` / `voidCustomDebt` / `voidDebtPayment`) refresh it too. The screen formats each net into the user's display currency. The card layout: the flags sit on **their own right-aligned line at the top** — the status pill (inactive / non-regular / paid / partial / unpaid) and the **debt** pill side by side; below them the usual card design — customer **name (left) with the month/date on the same line at the right**, then plan, then phone.

**Customer-detail "Transactions" panel.** The customer detail screen renders `CustomerDebtsPanel` (below `CustomerSalesPanel`) — a section titled **Transactions** that lists this customer's outstanding debts (partial months / partial sales / custom) grouped above their debt payments, with the net still-owed figure (or **Credit**) in the header. It's **read-only** (mutations stay in the Debts tab) and reads **independently** from the global `debts` slice via `debtService.getDebtsView({ customerId })` (not branch-scoped — shows all the customer's debts), refreshing on focus — the same isolation pattern as `CustomerSalesPanel`. The panel owns only the title + net header; the list body is the shared **`DebtList`** component (the two labeled sections built on `DebtItemCard` / `DebtPaymentCard` with `hideCustomerName`), the same component the Debtors modal renders — here with no action callbacks, so it's read-only.

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

## Multiple Plans per Customer (service lines)

A customer can subscribe to **several plans at once** (e.g. an ISP customer with internet + IPTV), each paid independently. The model splits the account from the service:

- **`customers`** — the account/person (name, phone, branch, `is_regular`, `active`). No `plan_id`.
- **`customer_plans`** (a **service line**) — one plan the customer is on, with its **own** `start_date`, `cancelled_at`, and `active`. `plan_id` may be NULL for a custom/occasional line.
- **`payments`** — link to a line via `customer_plan_id`; uniqueness is `UNIQUE(customer_plan_id, billing_month)`, so each line is paid separately for the same month. `plan_id` stays as the price snapshot.

**Layers.** New `customer-plans` module (repository / service / mapper) mirrors `plans`. The thin `customerPlans` slice exposes one action, `syncLines(customerId, lines, removedIds, tenantId)`, which applies the customer form's inline Plans editor. `CustomerPlanService.syncLines` runs removals + create/updates **concurrently**, **skips kept lines whose plan + start date are unchanged** (no round-trip), and **returns the resulting lines** (`{ active, cancelled }`). The slice rebuilds the owning customer's `customerPlans` **locally** via `customers.setCustomerLines` (active result + soft-cancelled removals + previously-cancelled lines kept for history) — **no `fetchCustomer` re-fetch** — so the grids built from them re-render. The edit path is therefore one round-trip when nothing about the plans changed (the customer update already returns fresh lines), instead of update → per-line write → re-fetch.

**Managing plans — in the customer form.** Add / change / remove plans happens **inline in `CustomerFormSheet`** (create AND edit): a "Plans" section lists one row per line — each row is the **plan dropdown + an inline start-date picker + a delete button on one line** — plus an "Add plan" button (minimum one row — a plan-less row records custom amounts). The start date is editable per line; new rows default to the customer's start date. On save, the form creates/updates the customer then calls `syncLines`. **Remove** = hard-delete a line with no payments, else soft-cancel (`active = false`) so payment history is never lost. Every customer ends up with ≥1 line.

**Month grid.** `PaymentService.buildMonthGrid(customerPlan, payments, year, graceDays)` builds **one grid per line** (payments pre-scoped to the line, boundary = `line.startDate`). The payment slice keeps `monthGridsByLine` keyed by line id; the algorithm is otherwise unchanged (rule #1).

**Customer detail (tabbed, view-only selector).** `CustomerPaymentPanel` shows a **line selector** (tabs) above the year card; one line's grid at a time. A single-line customer auto-selects it and hides the selector, so it looks exactly like before. Cancelled lines stay visible (dimmed) for history. The selector does **not** add/edit/remove lines — that's the customer form's job. Pay / void actions are scoped to the selected line and pass `line.id` as `customerPlanId`.

**Aggregation across lines.** Customer-list status is aggregated over a customer's **active** lines: fully-paid (green) only when every line is settled, partial (amber) when some coverage exists, overdue (red) if any active line has an unpaid month (`findOverdueCustomerIds` / `findPaymentStatusForMonth` / `computeCurrentMonthStatus`).

**Collect all due.** Customer-list Quick Pay (single or bulk) pays **every eligible fixed-price line** for the current month in one batch via `bulkPayCustomers` (one `BulkPayCustomerRequest` per line). Custom-price / plan-less customers fall back to the detail form. The Transactions → Payments rows show the plan name so a customer's lines are distinguishable.

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

Payments are **never re-recorded**, but the **Edit Payment** action on the receipt sheet can update `amount_due`, `amount_paid`, and `currency_id` in place via `PaymentService.updatePayment()`. Editing re-snapshots `rate_per_usd_snapshot` from the (possibly newly chosen) currency's live rate at edit time — the "user fixing the record" semantic. Voided payments remain locked. Wholesale corrections (changing `duration_months`, or restoring a voided payment) still require void + re-record.

---

## Multi-Select & Bulk Actions

A reusable list selection mode: long-press a card to enter it, every card's avatar becomes a checkbox, and the `PageHeader` is replaced by a toolbar of icon actions. Selection state is **ephemeral Presentation-layer state** — no slice/service/repo involvement.

**Reusable building blocks (domain-agnostic):**

- `useSelection()` — [`src/shared/hooks/useSelection.ts`](../SubsTrack/src/shared/hooks/useSelection.ts). Returns `{ active, selectedIds, count, isSelected, toggle, toggleMany, enterWith, clear }`. `active` is **derived** from `selectedIds.size > 0`, so deselecting the last item auto-exits. All mutators are `useCallback([])`-stable. `toggleMany(ids)` flips a group atomically (all-selected → remove all, else add all) and `enterWith(id | ids)` accepts a single id or an array — both used by the month grid to move a whole multi-month block as one unit.
- `useSelectionBackHandler(active, onExit)` — same file. Registers a focus-gated Android `BackHandler` (via expo-router `useFocusEffect`) so hardware back exits selection instead of navigating. The app's only `BackHandler` site; no-op on iOS/web.
- `PageHeader` `selection?: { active, count, actions, onClose }` prop — [`PageHeader.tsx`](../SubsTrack/src/shared/components/PageHeader.tsx). When `active`, an early-return renders `SelectionToolbar` (close button · "N selected" · icon-only action row) **in place of** the whole header, so the branch selector disappears automatically. Action shape `SelectionAction = { key, icon, label /*=a11y label*/, onPress, destructive?, disabled? }`. All other callers are untouched (prop is optional).
- `SelectAllBar` — [`SelectAllBar.tsx`](../SubsTrack/src/shared/components/SelectAllBar.tsx). A thin "select all" row (`Checkbox` + label) rendered **directly above the list** (not in the header) while in selection mode. Screens wire `onToggle` to `toggleMany(visibleIds)` (select-all when not all selected, clear when all are) and set `allSelected` from `visible.every(selected)`. "All" means the **currently visible/loaded** rows (post-filter, post-pagination), never unloaded pages.
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

## Developer Tools

**Native only** — gated by `IS_OFFLINE_CAPABLE`, since it's a viewer for the local SQLite mirror that only exists on native. Entry point: Settings → Data section → "Developer" row (hidden entirely on web).

- **Table browser** ([`DeveloperScreen.tsx`](../SubsTrack/src/modules/developer/screens/DeveloperScreen.tsx)): lists every table in `TABLES` (`src/core/offline/db/tables.ts`) plus the two bookkeeping tables not in that descriptor (`sync_meta`, `pending_deletes`), each with a live row count. Tapping a row opens [`DbTableViewer`](../SubsTrack/src/shared/components/DbTableViewer.tsx) — a reusable, fully self-contained component that takes only a `tableName` prop, runs `SELECT * FROM <table>` itself, derives columns from the fetched rows, and renders a horizontally-scrollable read-only grid. No editing anywhere.
- **Export Data**: dumps every table's raw rows (undecoded, `_dirty` included) as one JSON object (`{ [tableName]: rows[] }`) to the clipboard via `expo-clipboard`.
- **Import Data**: pastes a JSON blob of the same shape into a text box; after a destructive confirm (`confirm()` with `destructive: true`), it **wipes every local table** and inserts the JSON's rows exactly as given — no `encodeRow`/decode, no validation beyond "are the top-level keys known table names." This is intentionally raw and unsafe; it's a developer recovery/seeding tool, not a user-facing import.
- **Exception logging**: every caught error — React render errors (`ErrorBoundary`), uncaught JS errors (RN's global `ErrorUtils` handler), and every repository catch block (`BaseRepository`/`OfflineBaseRepository`'s shared `handleError`) — is written to a local `exception_logs` table via `logException()` (`src/core/errorLog/errorLogger.ts`), tagged with the current user/tenant and a `source` (`boundary` | `global_handler` | `repository` | `service`). The table is a synced tenant table but **push-only** (see [docs/offline.md](offline.md)) — logs go up to Supabase for centralized visibility but are never pulled back down into any device's mirror. Viewable locally like any other table in the Developer browser above.
