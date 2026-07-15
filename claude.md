## Cluade aknowledgment instructions

- Do not re-explore the codebase at the start of new sessions. Treat CLAUDE.md as the source of truth for project context and start from it directly.
- Whenever any architecture or context changed in this project, update CLAUDE.md to reflect it — and the matching detail file under `docs/` (see **Detailed Reference Docs** below) when the change touches an area documented there. Keep this lean core authoritative for the big picture; push exhaustive detail into `docs/`.
- I am still in Development phase, so i am open to change architectures and DB schema if needed.

---

## Reporting Completed Work

After completing a task, end the response with a `## Changes Made` section that lists only the final results:

- 3–5 bullets maximum, each a single short sentence.
- Cover only meaningful changes and outcomes — what changed, not how it was done.
- Use direct result statements; no "I updated / changed / completed" phrasing, no process, reasoning, progress updates, or commentary.
- No introductions, conclusions, filler, or self-referential statements.
- Plain, scannable language; include only what helps the reader understand what changed.
- Omit implementation details unless explicitly requested.

---

## Database Changes

Whenever a change to the database is needed:

1. **First update `sql scripts/script.sql`** so that a first-time run reproduces the same end state as the change (edit the `CREATE TABLE` / policy / trigger definitions in place — as if the DB were being created fresh with the change already included). `script.sql` is always the single source of truth for the full schema.
2. **Provide the migration script directly in the chat** — the exact `ALTER`/`CREATE`/`DROP` statements to run against the existing database. Make it idempotent where practical.
3. **Do NOT create a new `.sql` file** for the migration. `sql scripts/` holds only `script.sql` (full schema + RLS) and `reset.sql` (teardown).

---

## Detailed Reference Docs

This file is the lean core — always-needed context. Deeper detail lives in `docs/` and should be read and only read **on demand** when a task touches that area (don't read them all up front):

| File                                                   | Read it before…                                              | Covers                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [docs/project-structure.md](docs/project-structure.md) | navigating to a specific file                                | full directory trees for SubsTrack + SuperAdmin                                                                                                                                                                                                                               |
| [docs/features.md](docs/features.md)                   | editing a feature's behavior                                 | multi-tenancy, branches, auth flow, multi-month, multi-currency, app options, tiers, products/sales, transactions hub (Sales/Payments/Debts tabs), debts (runtime-computed customer ledger), collector wallet (runtime-computed per-collector cash-on-hand), regular customer, payment scenarios, multiple plans per customer (service lines) |
| [docs/gotchas.md](docs/gotchas.md)                     | editing payments / currency / branches / sales / signup code | the 41 non-obvious patterns & gotchas (with an area index at the top)                                                                                                                                                                                                         |
| [docs/edge-functions.md](docs/edge-functions.md)       | touching auth/user/tenant creation                           | `create-user`, `update-user-password`, `create-tenant`                                                                                                                                                                                                                        |
| [docs/offline.md](docs/offline.md)                     | touching ANY repository, or the sync engine                  | offline-first (native): the platform-switch seam, SQLite mirror, `_dirty`-flag push / incremental pull sync (`sync.ts`), `pending_deletes`, latest-updated_at-wins conflict policy                                                                                            |

When you need the exact current file layout, prefer a quick file search over trusting the tree in `docs/project-structure.md` — it can go stale.

---

**Stack:**

- React Native with Expo (latest SDK)
- Supabase (Auth + PostgreSQL + RLS)
- Zustand (state management)
- TypeScript (strict mode)
- NativeWind (Tailwind CSS for React Native — chosen for performance, zero runtime overhead, and excellent grid/layout support)

---

## Design Philosophy

Minimal, clean, and professional. The app is used daily by non-technical staff on mobile devices. Every screen must be immediately understandable. No animations, no decorative elements, no unnecessary complexity.

Priority order: clarity → speed → correctness → completeness.

---

## Project Overview

**SubsTrack** is a multi-tenant subscription management mobile application built for small businesses (ISPs, gyms, delivery services) that collect monthly fees from customers. Staff log in, manage customer lists, assign subscription plans, and record monthly payments. The system tracks which customers have paid and which are overdue using a dynamically generated monthly grid — months are never stored in the database, only payments are.

There are **two separate Expo React Native apps** in this workspace:

- `SubsTrack/` — The main tenant-facing app. Staff (admin + user roles) manage customers, payments, plans, and users.
- `SuperAdmin/` — A separate internal admin app for the SaaS owner to manage tenants and SaaS tiers (which configure grace periods, user/customer limits, etc.).

Also in the workspace: `sql scripts/` (`script.sql` schema+RLS, `reset.sql` teardown), `plan.md` (feature spec — source of truth for requirements), `new-features.md` (backlog), `Design/`, `QA/`. Full directory trees: [docs/project-structure.md](docs/project-structure.md).

---

## Running the Apps

Both apps share the same Supabase backend. Each has its own `.env` file with Supabase credentials.

```bash
# SubsTrack (main app)
cd SubsTrack
yarn install
yarn start          # Expo dev server (scan QR with Expo Go)
yarn android        # Android emulator
yarn ios            # iOS simulator
yarn deploy-create-user-edge-function    # Deploy Supabase Edge Function
yarn deploy-create-tenant-edge-function  # Deploy self-service tenant signup function (public, --no-verify-jwt)

# SuperAdmin
cd SuperAdmin
yarn install
yarn start
```

> **SubsTrack now requires a custom development build (dev client) — not Expo Go.** Since `react-native-keyboard-controller` (a native module) was added for keyboard handling, the app redboxes in Expo Go. For local dev use `npx expo run:android` / `npx expo run:ios` (or add `expo-dev-client` and build once); for distributables use the EAS profiles (`npm run build-preview` / `build-prod`). After pulling, run `npm install` first — the project actually uses `package-lock.json` (the `yarn` labels above are legacy; commands map 1:1 to `npm`).

**Environment variables** (create `.env` in each app folder):

```
EXPO_PUBLIC_SUPABASE_URL=<your-supabase-url>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

There is no automated test suite. Verification is manual via the running app.

---

## Tech Stack

| Layer         | Technology                                  |
| ------------- | ------------------------------------------- |
| Framework     | React Native 0.81.5 + Expo SDK 54           |
| Routing       | Expo Router 6 (file-based, typed routes)    |
| State         | Zustand 5.0.12                              |
| Styling       | NativeWind 4.2.3 (Tailwind CSS for RN)      |
| Database/Auth | Supabase (PostgreSQL + RLS + Auth)          |
| Language      | TypeScript strict mode                      |
| Localization  | i18next (English + Arabic, RTL support)     |
| Bottom sheets | @gorhom/bottom-sheet                        |
| Import alias  | `@/*` → repo root (e.g. `@/src/core/types`) |

---

## Architecture (MANDATORY)

Strict layered clean architecture. Dependencies flow **downward only** — no layer imports from a layer above it.

```
Presentation  →  State  →  Business Logic  →  Repository  →  Database
                                                              ↑
                                              Core (types/constants/utils — imported by all)
```

- **Layer 1 — Presentation.** Screens, UI components, UI-only hooks. Read store state, dispatch store actions. **Zero** business logic. **Zero** direct Supabase calls.
- **Layer 2 — State (Zustand slice pattern).** One global store assembled from per-feature slices in `src/state/slices/`, using `immer` middleware. Slices hold data + `loading`/`error`/`tierLimitError`. Async actions call **services, never repositories**. Components read through per-slice hooks (`useCustomerSlice`, …) **with a selector**. Cross-slice reads happen via `get().<otherSlice>` inside actions; slice files never import peer slices' creators or hooks (types only).
- **Layer 3 — Business Logic (Services).** Pure TypeScript classes. **No** React, **no** Supabase imports. All validation, transformation, decision/algorithm logic. Receives domain models, returns domain models or throws typed errors.
- **Layer 4 — Repository.** The **only** layer that imports Supabase. All DB calls + bidirectional mapping between DB row types (snake_case) and domain models (camelCase). Each repository ≈ one table. Extends `BaseRepository` (holds the supabase client + `handleError()` / `handleFunctionsError()`).
- **Layer 5 — Core.** Shared types, interfaces, constants, utils. Imported by all layers. Never imports from any other layer.

### Offline-First (native only) — the repository seam

The **native** app is offline-first; **web is unchanged** (talks to Supabase directly). This is contained entirely in the repository layer + `src/core/offline/`. Services, slices, and UI are untouched.

- Each repository file is a **platform switch**: `export default Platform.OS === 'web' ? new XxxRepository() : new OfflineXxxRepository()`. Both the Supabase class (unchanged) and `OfflineXxxRepository` `implements IXxxRepository` — the compiler keeps them in lockstep. Services import the default, so nothing above the repo layer changes.
- **Offline reads/writes hit a local SQLite mirror** (`expo-sqlite`) that returns the **same `Db*` row shapes** (incl. nested joins) the mappers already consume. Writes mutate the mirror and flag the row `_dirty = 1` (hard deletes are logged in `pending_deletes`). A small **sync** (`src/core/offline/sync.ts`) pushes every `_dirty` row (+ logged deletes) to Supabase, then pulls rows changed since one `last_pulled_at` timestamp — **latest `updated_at` wins**. Multi-device, bidirectional. No outbox, no cursors, no tombstones.
- **Online-only** (throw `RequiresConnectionError` offline, delegate to the Supabase sibling online): auth `signIn`/`getTenantByCode`, `User.create`/`delete`/`updatePassword` (edge fns), `Signup.*`, `Subscription.upgradeTenant`. Auth `getSession`/`getUserProfile`/`getTenant` are a read-through cache so the app boots offline after the first online login.
- Requires the Postgres changes now in `sql scripts/script.sql` (`updated_at` + BEFORE UPDATE triggers on every synced table) and a **dev-client rebuild** (native module).

**Full detail — read [docs/offline.md](docs/offline.md) before touching any repository or the sync engine.**

### State Management — key rules

- Arrays inside slices are named `items` (not `customers.customers`); other fields keep semantic names (`metrics`, `tiers`, `currentTier`, `monthGrid`, …).
- **Always pass a selector** in component bodies: `useCustomerSlice((s) => s.items)`. Subscribing to the whole slice (`const slice = useCustomerSlice()`) is **banned** — it re-renders on every change.
- The global store is stashed on `globalThis` (survives Metro Fast Refresh) via `getStore()` in [globalStore.ts](SubsTrack/src/state/globalStore.ts).
- **Two intentional exceptions** — standalone `persist`-middleware Zustand stores, kept out of the global store so domain state never accidentally persists: `src/shared/lib/uiPrefStore.ts` (display currency, last-used currency, `currentBranchId`) and `src/core/i18n/languageStore.ts` (en/ar). Both persist to AsyncStorage.
- Tier/usage flow **into** actions as parameters from components; actions may still call `get().subscription.refreshUsage()` after a create. See the full slice template + tier-gating example in [docs/features.md](docs/features.md) → Subscription Tiers.

---

## Data Models

Domain types (camelCase) live in `src/core/types/index.ts` — used everywhere except inside repositories. DB row types (snake_case) live in `src/core/types/db.ts` and **never leave the repository layer**. Compact field reference (the source file is authoritative for exact shapes):

```typescript
type UserRole = "superadmin" | "admin" | "user";
type MonthStatus = "paid" | "partial" | "unpaid" | "future" | "before_start";

AuthUser     { id, username, fullName, role, active, tenantId, tenant, branchId /*null=tenant-wide admin*/, branch? }
AppUser      { id, username, fullName, phoneNumber, role, active, tenantId, branchId /*null=tenant-wide*/, createdAt }
Branch       { id, tenantId, name, active /*soft-delete*/, createdAt, updatedAt }
Tenant       { id, name, tenantCode, active, tierId, tier? /*joined from tier_plans*/, tierUpgradedAt, createdAt }
Currency     { id, tenantId, code /*e.g. LBP; USD never stored*/, name, symbol, ratePerUsd /*1 USD = N units*/, decimals /*0–6*/, active, createdAt, updatedAt }
TierPlan     { id, code /*free|pro|business*/, name, sortOrder, maxCustomers, maxUsers, maxPlans, maxBranches, maxCurrencies /*null=unlimited*/, multiCurrencyEnabled, multiMonthPlansEnabled, graceDays, priceMonthlyUsd, priceYearlyUsd?, active }
TenantUsage  { customers, users, plans, branches, currencies }
TierResource = "customers" | "users" | "plans" | "branches" | "currencies"
Plan         { id, name, price, isCustomPrice, durationMonths /*1–12*/, currencyId /*null=USD*/, branchId /*null=SHARED*/, tenantId, createdAt }
Customer     { id, name, phoneNumber, address, area?, notes?, locationUrl /*raw Google Maps share link; open-in-Maps*/, active, isRegular /*subscription vs occasional*/, branchId /*null=UNASSIGNED*/, tenantId, startDate, cancelledAt, createdAt, updatedAt, customerPlans? /*service lines*/ }
CustomerPlan { id, customerId, planId /*null=custom/occasional line*/, startDate, cancelledAt, active, tenantId, createdAt, updatedAt, plan? } /*one service line; a customer can hold several, each paid independently*/
Payment      { id, billingMonth /*YYYY-MM-01*/, amountDue /*snapshot*/, amountPaid /*≤due; 0=unpaid slot*/, balance /*generated*/, durationMonths /*≥1*/, currencyId /*null=USD*/, ratePerUsdSnapshot /*frozen rate; USD=1*/, customerId, customerPlanId /*the service line*/, planId /*price snapshot*/, receivedByUserId, tenantId, paidAt, voidedAt, voidedBy, notes, remittedAt /*null=still in collector wallet*/, remittedBy /*admin who received the cash*/, createdAt }
MonthEntry   { year, month, label, billingMonth, status: MonthStatus, payment: Payment|null, isGroupSecondary /*true for months 2+ of a multi-month payment*/ }
DashboardMetrics { totalCustomers, activeCustomers, monthlyRevenue, subscriptionRevenue, salesRevenue, unpaidThisMonth, totalUsers, totalPlans, totalDebt /*net debt across all customers/categories, all-time — via DebtService.getDebtsView, not month-scoped*/, monthsDebt, salesDebt /*gross breakdown of totalDebt by category*/, walletCash /*collector-wallet cash not yet handed over, net USD — admin-only, 0 for non-admins (getMetrics(branchFilter, includeWallet))*/, walletCollectors, walletTransactions, newCustomersThisMonth, cancelledThisMonth, paymentsCollectedCount, salesCount, prevMonthRevenue, revenueTrend /*RevenuePoint[] — 6 months ending on the current month; the chart can page further back/forward via `DashboardService.getRevenueTrend(anchorYear, anchorMonth)` + the dashboard slice's `trend`/`trendAnchor`/`navigateTrend`, capped at the current month*/ }
RevenuePoint { month /*YYYY-MM*/, monthIndex, year, subscription /*USD*/, sales /*USD*/, total /*USD*/ }
```

> `products` + `sales` add a one-off ledger (separate from subscription `payments`). Their domain shapes + behavior are in [docs/features.md](docs/features.md) → Products & One-Off Sales.

> **Debts** (Transactions → Debts tab) is a per-customer accounts-receivable view. A customer's total debt is **computed at runtime**: `net = Σ(category debts) − Σ(debt payments)`. Categories: **months** (partial `payments` where `balance > 0`), **sales** (partial `sales` where `amount_paid < total_amount`), **services** (reserved, 0 for now), **custom** (the new `custom_debts` table). **Debt payments** (`debt_payments` table) are tied only to a customer and never modify the underlying payment/sale row. `CustomDebt` / `DebtPayment` / `DebtItem` / `DebtPaymentItem` / `DebtSummary` / `DebtCategory` live in `src/core/types`. Full behavior in [docs/features.md](docs/features.md) → Debts.

> **Collector Wallet** (Admin → Wallets; every user's own read-only view in Settings → My Wallet) shows the cash each user collected but has **not yet handed over** to an admin. Also **computed at runtime**, never stored as a balance: a collector's wallet = their non-voided, **unremitted** `payments.amount_paid` + `sales.amount_paid` + `debt_payments.amount`, grouped **per currency** (physical cash) and summed in USD via each row's frozen snapshot rate. Per-transaction settle: an admin marks rows received (stamps `remitted_at`/`remitted_by` on the source row — the only new columns, added to `payments`/`sales`/`debt_payments`), or "receive all" empties a collector's wallet at once. Void/edit of a source row self-corrects; a void + re-pay resets `remitted_at` to NULL. `WalletItem` / `WalletCurrencyTotal` / `CollectorWallet` / `CollectorWalletDetail` / `WalletSource` live in `src/core/types`; logic in `src/modules/wallet/services/WalletService.ts`. Full behavior in [docs/features.md](docs/features.md) → Collector Wallet.

### Database Schema (Supabase PostgreSQL)

| Table            | Key columns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenants`        | `id`, `name`, `tenant_code`, `active`, `tier_id`, `tier_upgraded_at`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tier_plans`     | `id`, `code`, `name`, `sort_order`, `max_customers`, `max_users`, `max_plans`, `max_branches`, `max_currencies`, `multi_currency_enabled`, `multi_month_plans_enabled`, `grace_days`, `price_monthly_usd`, `price_yearly_usd`, `active`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `app_options`    | `id`, `key` (unique), `value`, `description`, `created_at`, `updated_at` — **global** app-wide key/value config (e.g. `LiraRate`, `AllowPlanUpgrade`, `AllowSelfServiceSignup`, `SupportWhatsAppNumber`); NOT tenant-scoped. SuperAdmin writes (service role); read by **anon + authenticated** (anon needed because some flags gate pre-auth UI). Fetched at app bootstrap (not only post-auth) and intentionally **not** reset on logout. Read via typed hooks in `useOptionSlice.ts` (`useOptionValue` / `useBooleanOption` / `useCanUpgradePlan` / `useSelfServiceSignupEnabled` / `useSupportWhatsAppNumber`); for conditional UI wrap the element in the gate components `<CanUpgrade>` / `<CanCreateWorkspace>` from `shared/components/FeatureGate.tsx`; keys live in `OPTION_KEYS` |
| `currencies`     | `id`, `tenant_id`, `code`, `name`, `symbol`, `rate_per_usd`, `decimals`, `active`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `branches`       | `id`, `tenant_id`, `name`, `active`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `users`          | `id` (= auth.users.id), `username`, `full_name`, `phone_number`, `role`, `active`, `tenant_id`, `branch_id`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `plans`          | `id`, `name`, `price`, `is_custom_price`, `duration_months`, `currency_id`, `branch_id`, `tenant_id`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `customers`      | `id`, `name`, `phone_number`, `address`, `area`, `notes`, `location_url` (raw Google Maps share link, nullable), `active`, `is_regular`, `branch_id`, `tenant_id`, `start_date`, `cancelled_at` (NO `plan_id` — a customer's plans live in `customer_plans`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `customer_plans` | `id`, `customer_id`, `plan_id` (null=custom/occasional line), `start_date`, `cancelled_at`, `active`, `tenant_id` — **one service line per row**; a customer can hold several plans, each paid independently. No own `branch_id` (RLS inherits the customer's).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `payments`       | `id`, `billing_month` (YYYY-MM-01), `amount_due`, `amount_paid`, `balance` (gen), `duration_months`, `currency_id`, `rate_per_usd_snapshot`, `customer_id`, `customer_plan_id` (the service line), `plan_id` (price snapshot), `received_by_user_id`, `tenant_id`, `paid_at`, `voided_at`, `voided_by`, `notes`, `remitted_at` / `remitted_by` (collector-wallet handover — also on `sales` + `debt_payments`)                                                                                                                                                                                                                                                                                                                                                                             |

(`products` + `sales` tables also exist — see [docs/features.md](docs/features.md) → Products & One-Off Sales. `sales` gained `amount_paid` — partial sales leave a debt. `custom_debts` + `debt_payments` back the Debts tab. `exception_logs` (`id`, `tenant_id`, `user_id`, `username`, `source`, `message`, `stack`, `context`, `occurred_at`) is a native-only, push-only crash/error log — see [docs/offline.md](docs/offline.md) and Settings → Developer in [docs/features.md](docs/features.md).)

**Key constraints:**

- `UNIQUE(username, tenant_id)` on users
- `UNIQUE(tenant_id, branch_id, name)` on plans — same name can coexist as "Shared" + branch-specific (NULLs are unequal in PG)
- `UNIQUE(tenant_id, name)` on branches
- `UNIQUE(tenant_id, code)` on currencies; `code` is enforced uppercase and not 'USD'
- `UNIQUE(customer_plan_id, billing_month)` on payments — one payment per **service line** per month (was `(customer_id, billing_month)`); a customer with several lines can pay each line for the same month
- `plan_id` on customer_plans: `ON DELETE SET NULL` (deleting a plan leaves the line plan-less; payment history kept via `payments.plan_id` snapshot)
- `customer_id` on customer_plans / payments: `ON DELETE CASCADE`; `customer_plan_id` on payments: `ON DELETE CASCADE`
- `branch_id` on users / customers / plans: `ON DELETE SET NULL` (deleting a branch reverts records to "unassigned" / "shared")
- `currency_id` on plans and payments: `ON DELETE RESTRICT` (use `active = false` soft-delete on currencies instead)

---

## Critical Business Logic: Month Grid

**`PaymentService.buildMonthGrid(customerPlan, payments, year, graceDays)`** is the **single source of truth** for month status. No other file may reimplement this. It builds the grid for **one service line** (`CustomerPlan`): `payments` are pre-scoped to that line and `customerPlan.startDate` sets the before_start boundary. A customer with several lines renders one grid per line (the payment slice keeps `monthGridsByLine`, keyed by line id).

```
Status algorithm per month:
1. month < line.startDate                                  → "before_start" (gray, non-tappable)
2. payment exists, voidedAt === null, balance === 0        → "paid" (green for regular, yellow for non-regular)
3. payment exists, voidedAt === null, balance > 0          → "partial" (amber for both regular + non-regular)
4. month is in the future                                  → "future" (gray)
5. now ≤ first-of-month + graceDays                        → "future" (gray, within grace window)
6. otherwise                                               → "unpaid" (red for regular, light gray for non-regular)
```

- Months are **never stored in DB** — generated dynamically from the payment list for a given year.
- Voided payments are invisible to the grid (treated as non-existent).
- `graceDays` comes from the tenant's current `TierPlan` (fetched by the `subscription` module during auth). The `useGraceDays()` selector hook is the single read site for components.
- Multi-month payments build a **coverage map**: each payment with `durationMonths > 1` covers consecutive months. Months 2+ in a block have `isGroupSecondary = true` and display "Included" instead of "Paid". A partial bundle shows every covered month as `"partial"`.
- `customer.isRegular` controls cell colors and unpaid-banner visibility. `"partial"` uses amber for everyone — a balance is owed either way.
- **Multiple plans per customer:** a customer holds 1..N service lines (`customer_plans`), each its own grid + independent payments. Lines are added / changed / removed from the **customer form's inline Plans editor** (`customerPlans.syncLines`); the payment panel's line selector is **view-only**. Overdue / current-month status sets are **aggregated across a customer's active lines** (`findOverdueCustomerIds`, `findPaymentStatusForMonth`, `computeCurrentMonthStatus`): fully-paid only when every active line is settled, partial when some coverage exists, overdue if any active line has an unpaid month. Customer-list "Collect all due" pays every eligible fixed-price line for the current month at once. Full detail in [docs/features.md](docs/features.md) → Multiple Plans per Customer.
- A `"partial"` month behaves like `"paid"` everywhere a payment record matters (tap opens `PaymentDetailSheet`, multi-month grouping merges them, year summary counts them as paid, `PaymentFormSheet` treats them as multi-month conflicts). The unpaid banner / unpaid tab only fire for `"unpaid"`.

> Recording multi-month payments (`createMultiMonthPayment`, conflict resolution), the full payment scenarios (A/B/C/D, full vs partial, edit-payment re-snapshot), and the snapshot/currency rules are in [docs/features.md](docs/features.md) and [docs/gotchas.md](docs/gotchas.md).

---

## Styling

- NativeWind (Tailwind) classnames on all components. Design tokens in `src/shared/constants/colors.ts`.
- Custom `Text` component handles Cairo font for Arabic, system font for English.
- RTL support via `I18nManager`; language change triggers a full app reload (see gotcha #5).
- Keyboard avoidance uses `react-native-keyboard-controller`, **never** RN's built-in `KeyboardAvoidingView` (see gotcha #39).
- Entity list rows (customers, users, plans, branches, currencies, products, sales) share one shell: `<EntityCard>` (`src/shared/components/EntityCard.tsx`). It owns the common chrome — wrapper styling, the tap/long-press selection handshake, the icon-tile↔checkbox swap, and the trailing 3-dot menu — so each card only passes its icon (`icon`/`iconColor`/`iconBgClassName`), the `on*` callbacks, optional `dimmed`/`menuLoading`, and its body as children. Build new list cards on top of it; don't re-hand-roll the card skeleton.
- Web/desktop width is capped via `<ResponsiveContainer>` (`src/shared/components/ResponsiveContainer.tsx`) — wraps each screen's body (and each page-sheet form) in a centered, max-width column. It's a no-op on phones (always narrower than the cap), so phone layout is unaffected; it only kicks in on wide viewports. Centered dialogs (`ActionMenu`, `ConfirmDialog`, `UpgradePromptModal`) cap themselves inline with a `max-w-*` class instead.
- Page sheets share one shell: `<SheetModal>` (`src/shared/components/SheetModal.tsx`) — RN `Modal` + the standard `slide`/`pageSheet` chrome + `onDismiss` wired to native hardware-back AND browser Back on web. Build new sheets on it. On web, browser **Back closes the topmost open modal** instead of changing the route (mirrors Android hardware-back) via the `useWebBackDismiss(active, onDismiss)` hook — dialogs and pickers that keep a custom `Modal` call the hook directly. See gotcha #44.

---

## Error Handling

- All async store actions wrap in try/catch → set `error: string | null`.
- Screens display errors via `<ErrorBanner>` — inline, **never** toast/alert.
- `clearError()` is called on user input or form unmount.
- Raw Supabase errors are caught in repositories and converted to user-friendly messages.
- `"account_not_configured"` is a special error code from AuthService that triggers specific UI.
- Edge-function errors go through `BaseRepository.handleFunctionsError`, never raw `handleError` (see gotcha #40).

---

## Code Quality & Architecture

- Write clean, readable, maintainable code — clarity beats cleverness. If the cleanest scalable solution is a big change, do it rather than a band-aid fix.
- Follow SOLID strictly: **S** one responsibility per file/class/function · **O** extend without modifying working code · **L** subtypes substitutable for base types · **I** small focused interfaces · **D** depend on abstractions, not concretions.

### Dependencies

- Introduce a library only when it meaningfully reduces complexity or risk; prefer well-maintained, widely adopted packages that fit the existing ecosystem (size, maintenance, license, TS support). Always check if a suitable library is already installed first.

### Simplicity

- Default to the simplest solution that correctly solves the problem — avoid over-engineering and premature abstraction. If logic feels complex, stop and rethink; there's almost always a simpler path. Write code a new team member could understand without explanation.

### Consistency

- Before implementing, scan the surrounding codebase for existing patterns, naming, and structure, and match them. When in doubt, prefer consistency with existing code over personal preference. If an existing pattern looks like an anti-pattern, flag it with a comment rather than silently diverging.

### plan.md & QA

- When a new feature is introduced, update `plan.md` to reflect the current implementation.
- When any new scenario is added, add the test-plan scenarios for it under `QA/`.

---

## Critical Non-Negotiable Rules

1. **Month status logic lives ONLY in `PaymentService.buildMonthGrid()`** — never reimplement elsewhere.
2. **`tenant_id` always from the Supabase JWT** — never from client-supplied input.
3. **DB row types (snake_case) never escape the repository layer.**
4. **No business logic in components or stores.**
5. **No direct Supabase calls outside the repository layer** (the offline **sync engine** in `src/core/offline/sync/` is the one sanctioned exception — it is the replay/pull bridge to Supabase; see [docs/offline.md](docs/offline.md)).
   5b. **Native repositories are a platform switch** (`Platform.OS === 'web' ? Supabase : Offline`). Never call `new XxxRepository()` directly from a service/slice — import the default. Both impls must `implements IXxxRepository`; a change to one's method surface must change the interface (and thus the other).
6. **RLS enforces multi-tenancy** — app-level filtering is secondary.
7. **No hard deletes** — use `voided_at` for payments, `active = false` / `cancelled_at` for customers (and `active = false` for branches/currencies/products).
8. **Payment amount is a snapshot** — never recompute from `plan.price` after recording.
9. **All app state lives in one global Zustand store** assembled from per-feature slices in `src/state/slices/`. Slice files may import peer-slice _types_ but never their creators or hooks. Cross-slice reads happen inside actions via `get().<otherSlice>`. Caller-supplied data (tier, usage, currency) still flows in as parameters from the component.
10. **All errors caught and stored in state** — never surface raw Supabase error messages to the user.
11. **Tier limits enforced at the service layer** — every `Service.createX()` calls `tierService.assertCanCreate(tier, usage, resource)` after `validate()`. `TierLimitError` flows through stores as a structured `tierLimitError` field; never parse error strings.
