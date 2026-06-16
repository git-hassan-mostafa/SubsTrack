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
- [Regular Customer](#regular-customer)
- [Payment Scenarios](#payment-scenarios)

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

`app_options` is a **global, app-wide** key/value table (NOT tenant-scoped — no `tenant_id`). Columns: `id`, `key` (unique), `value` (text), `description`, timestamps. It holds cross-tenant configuration the SaaS owner controls. The seeded row today is `LiraRate` — the default USD→LBP rate (LBP per 1 USD) used when seeding each new tenant's LBP currency.

- **RLS:** `app_options_select` grants `SELECT` to `authenticated` only (anon has no access, unlike `tier_plans`). There is **no** write policy, so only the **service role** (SuperAdmin app + the `create-tenant` edge function) can insert/update/delete — RLS bypass is the write path.
- **SuperAdmin** owns full CRUD via the **Options** tab ([app/(tabs)/options.tsx](<../SuperAdmin/app/(tabs)/options.tsx>) → `OptionsScreen`). The `options` module mirrors `tier-plans` (repository + service + standalone `optionStore` + screen + `OptionFormSheet`) but adds create + delete. The option **key is immutable after creation** (only `value` + `description` are editable), so well-known keys like `LiraRate` can't be renamed out from under the code that reads them.
- **SubsTrack** has a **read-only** `options` module (repository `findAll`/`findByKey` + `OptionService.getOptions`/`getOptionValue` + `optionSlice` + `useOptionSlice`). It never writes. Options are primed into state on login/restore via `primePostAuth` (alongside currencies/branches) and cleared on `logout`. Reference keys through `OPTION_KEYS` (e.g. `OPTION_KEYS.liraRate`), never magic strings.

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

**Customer sales surfaces:** the customer detail screen renders `CustomerSalesPanel` at the **bottom** (below the payment grid + details card). The panel shows only a **5-sale preview**; when the customer has more it renders a "Show all" link to a dedicated full-page list (`CustomerSalesListScreen` at `customers/[id]/sales`) that mirrors the Sales tab (search + infinite scroll + record FAB + void) but is locked to one customer. Both surfaces keep their **list reads** independent of the global `sales` slice — the panel via `saleService.getSalesForCustomer` (with a stale-response token guard), the full page via the `useCustomerSalesList` hook — so neither clobbers the Sales tab's filter/search/list state. **Mutations, however, route through the global slice** so the Sales tab cache stays coherent: creates go through `SaleFormSheet` → `saleSlice.createSale` (unshift), and voids go through `saleSlice.voidSale` (drops the row from `sales.items`); each surface then refreshes its own local list. The panel additionally refreshes on focus (`useFocusEffect`) so changes made on the full page reflect on return. Neither surface applies a branch filter: they show **all** of the customer's sales regardless of the admin's current branch view.

**Dashboard:** `DashboardService.getMetrics()` parallel-fetches `sales.totalsForMonth(monthStart, monthEndExclusive, branchFilter)` alongside the existing payment queries. The Revenue card on the home dashboard shows `monthlyRevenue = subscriptionRevenue + salesRevenue`, with a sub-line "Subscriptions: $X · Sales: $Y" rendered when `salesRevenue > 0`. All values are summed in USD via each row's frozen `rate_per_usd_snapshot`, then formatted into the user's display currency at render.

**Tier-gating** is sale-blind: products consume a slot (gated by `max_products`), but recording sales is unlimited on every tier.

See gotchas #35, #36, #37.

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

## Payment Scenarios

| Scenario        | Condition                                                  | Amount field                                                                        |
| --------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| A — Fixed       | Plan exists, `isCustomPrice = false`, `durationMonths = 1` | Pre-filled with `plan.price`, read-only                                             |
| B — Override    | Same as A, user toggles override                           | Radio: "Plan price" or "Custom amount"                                              |
| C — Custom      | `isCustomPrice = true`, or no plan                         | Amount input required, no default                                                   |
| D — Multi-month | Plan exists, `isCustomPrice = false`, `durationMonths > 1` | Pre-filled with `plan.price` (bundle), read-only; calls `createMultiMonthPayment()` |

**Full vs Partial** is decided in the `PaymentAmountPaidSection` at the bottom of the form, just above the submit button. Default is Full → `amount_paid = amount_due`. Partial reveals a single Amount Paid input locked to the resolved currency; the Amount Due is always derived from the upper section (plan price for A/D, plan or custom for B, custom for C).

Payments are **never re-recorded**, but the **Edit Payment** action on the receipt sheet can update `amount_due`, `amount_paid`, and `currency_id` in place via `PaymentService.updatePayment()`. Editing re-snapshots `rate_per_usd_snapshot` from the (possibly newly chosen) currency's live rate at edit time — the "user fixing the record" semantic. Voided payments remain locked. Wholesale corrections (changing `duration_months`, or restoring a voided payment) still require void + re-record.
