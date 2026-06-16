## Cluade aknowledgment instructions

- Do not re-explore the codebase at the start of new sessions. Treat CLAUDE.md as the source of truth for project context and start from it directly.
- Whenever any architecture or context changed in this project, update CLAUDE.md to reflect it — and the matching detail file under `docs/` (see **Detailed Reference Docs** below) when the change touches an area documented there. Keep this lean core authoritative for the big picture; push exhaustive detail into `docs/`.
- I am still in Development phase, so i am open to change architectures and DB schema if needed.
- whenever a feature from the file new-features.md file is done, mark it as done.

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

## Detailed Reference Docs

This file is the lean core — always-needed context. Deeper detail lives in `docs/` and should be read **on demand** when a task touches that area (don't read them all up front):

| File                                                   | Read it before…                                              | Covers                                                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [docs/project-structure.md](docs/project-structure.md) | navigating to a specific file                                | full directory trees for SubsTrack + SuperAdmin                                                                                          |
| [docs/features.md](docs/features.md)                   | editing a feature's behavior                                 | multi-tenancy, branches, auth flow, multi-month, multi-currency, app options, tiers, products/sales, regular customer, payment scenarios |
| [docs/gotchas.md](docs/gotchas.md)                     | editing payments / currency / branches / sales / signup code | the 40 non-obvious patterns & gotchas (with an area index at the top)                                                                    |
| [docs/edge-functions.md](docs/edge-functions.md)       | touching auth/user/tenant creation                           | `create-user`, `update-user-password`, `create-tenant`                                                                                   |

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
Customer     { id, name, phoneNumber, address, area?, notes?, active, isRegular /*subscription vs occasional*/, planId, branchId /*null=UNASSIGNED*/, tenantId, startDate, cancelledAt, createdAt, updatedAt, plan? }
Payment      { id, billingMonth /*YYYY-MM-01*/, amountDue /*snapshot*/, amountPaid /*≤due; 0=unpaid slot*/, balance /*generated*/, durationMonths /*≥1*/, currencyId /*null=USD*/, ratePerUsdSnapshot /*frozen rate; USD=1*/, customerId, planId, receivedByUserId, tenantId, paidAt, voidedAt, voidedBy, notes, createdAt }
MonthEntry   { year, month, label, billingMonth, status: MonthStatus, payment: Payment|null, isGroupSecondary /*true for months 2+ of a multi-month payment*/ }
DashboardMetrics { totalCustomers, activeCustomers, monthlyRevenue, unpaidThisMonth, totalUsers, totalPlans }
```

> `products` + `sales` add a one-off ledger (separate from subscription `payments`). Their domain shapes + behavior are in [docs/features.md](docs/features.md) → Products & One-Off Sales.

### Database Schema (Supabase PostgreSQL)

| Table         | Key columns                                                                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenants`     | `id`, `name`, `tenant_code`, `active`, `tier_id`, `tier_upgraded_at`                                                                                                                                                                                    |
| `tier_plans`  | `id`, `code`, `name`, `sort_order`, `max_customers`, `max_users`, `max_plans`, `max_branches`, `max_currencies`, `multi_currency_enabled`, `multi_month_plans_enabled`, `grace_days`, `price_monthly_usd`, `price_yearly_usd`, `active`                 |
| `app_options` | `id`, `key` (unique), `value`, `description`, `created_at`, `updated_at` — **global** app-wide key/value config (e.g. `LiraRate`); NOT tenant-scoped. SuperAdmin writes (service role); SubsTrack reads (authenticated SELECT only)                     |
| `currencies`  | `id`, `tenant_id`, `code`, `name`, `symbol`, `rate_per_usd`, `decimals`, `active`                                                                                                                                                                       |
| `branches`    | `id`, `tenant_id`, `name`, `active`                                                                                                                                                                                                                     |
| `users`       | `id` (= auth.users.id), `username`, `full_name`, `phone_number`, `role`, `active`, `tenant_id`, `branch_id`                                                                                                                                             |
| `plans`       | `id`, `name`, `price`, `is_custom_price`, `duration_months`, `currency_id`, `branch_id`, `tenant_id`                                                                                                                                                    |
| `customers`   | `id`, `name`, `phone_number`, `address`, `area`, `notes`, `active`, `is_regular`, `plan_id`, `branch_id`, `tenant_id`, `start_date`, `cancelled_at`                                                                                                     |
| `payments`    | `id`, `billing_month` (YYYY-MM-01), `amount_due`, `amount_paid`, `balance` (gen), `duration_months`, `currency_id`, `rate_per_usd_snapshot`, `customer_id`, `plan_id`, `received_by_user_id`, `tenant_id`, `paid_at`, `voided_at`, `voided_by`, `notes` |

(`products` + `sales` tables also exist — see [docs/features.md](docs/features.md) → Products & One-Off Sales.)

**Key constraints:**

- `UNIQUE(username, tenant_id)` on users
- `UNIQUE(tenant_id, branch_id, name)` on plans — same name can coexist as "Shared" + branch-specific (NULLs are unequal in PG)
- `UNIQUE(tenant_id, name)` on branches
- `UNIQUE(tenant_id, code)` on currencies; `code` is enforced uppercase and not 'USD'
- `UNIQUE(customer_id, billing_month)` on payments (enforced at DB level and in PaymentService)
- `plan_id` on customers: `ON DELETE SET NULL`
- `customer_id` on payments: `ON DELETE CASCADE`
- `branch_id` on users / customers / plans: `ON DELETE SET NULL` (deleting a branch reverts records to "unassigned" / "shared")
- `currency_id` on plans and payments: `ON DELETE RESTRICT` (use `active = false` soft-delete on currencies instead)

---

## Critical Business Logic: Month Grid

**`PaymentService.buildMonthGrid(customer, payments, year, graceDays)`** is the **single source of truth** for month status. No other file may reimplement this.

```
Status algorithm per month:
1. month < customer.startDate                              → "before_start" (gray, non-tappable)
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
- A `"partial"` month behaves like `"paid"` everywhere a payment record matters (tap opens `PaymentDetailSheet`, multi-month grouping merges them, year summary counts them as paid, `PaymentFormSheet` treats them as multi-month conflicts). The unpaid banner / unpaid tab only fire for `"unpaid"`.

> Recording multi-month payments (`createMultiMonthPayment`, conflict resolution), the full payment scenarios (A/B/C/D, full vs partial, edit-payment re-snapshot), and the snapshot/currency rules are in [docs/features.md](docs/features.md) and [docs/gotchas.md](docs/gotchas.md).

---

## Styling

- NativeWind (Tailwind) classnames on all components. Design tokens in `src/shared/constants/colors.ts`.
- Custom `Text` component handles Cairo font for Arabic, system font for English.
- RTL support via `I18nManager`; language change triggers a full app reload (see gotcha #5).
- Keyboard avoidance uses `react-native-keyboard-controller`, **never** RN's built-in `KeyboardAvoidingView` (see gotcha #39).

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
5. **No direct Supabase calls outside the repository layer.**
6. **RLS enforces multi-tenancy** — app-level filtering is secondary.
7. **No hard deletes** — use `voided_at` for payments, `active = false` / `cancelled_at` for customers (and `active = false` for branches/currencies/products).
8. **Payment amount is a snapshot** — never recompute from `plan.price` after recording.
9. **All app state lives in one global Zustand store** assembled from per-feature slices in `src/state/slices/`. Slice files may import peer-slice _types_ but never their creators or hooks. Cross-slice reads happen inside actions via `get().<otherSlice>`. Caller-supplied data (tier, usage, currency) still flows in as parameters from the component.
10. **All errors caught and stored in state** — never surface raw Supabase error messages to the user.
11. **Tier limits enforced at the service layer** — every `Service.createX()` calls `tierService.assertCanCreate(tier, usage, resource)` after `validate()`. `TierLimitError` flows through stores as a structured `tierLimitError` field; never parse error strings.
