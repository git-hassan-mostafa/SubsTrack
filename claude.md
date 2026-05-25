## Cluade aknowledgment instructions

- Do not re-explore the codebase at the start of new sessions. Treat CLAUDE.md as the source of truth for project context and start from it directly.
- Whenever any architecture or context changed in this project directly update the CLAUDE.md to reflect it.
- After the first message of each conversation say "Hello From CLAUDE.md, This message is to let you know that i am taking instructions from CLAUDE.md file successfully.", so i know you are reading from ClAUDE.md
- I am still in Development phase, so i am open to change architectures and DB schema if needed.
- whenever a feature from the file new-features.md file is done, mark it as done.

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

## Architecture (MANDATORY)

Follow strict layered clean architecture. Dependencies only flow downward. No layer may import from a layer above it.

```
Presentation  →  State  →  Business Logic  →  Repository  →  Database
```

### Layer 1 — Presentation

Screens, UI components, and UI-only hooks. Components read from stores and dispatch store actions. Zero business logic. Zero direct Supabase calls.

### Layer 2 — State (Zustand)

One store per feature module. Stores hold loading/error state and the feature's data. Async actions call services — never repositories directly.

### Layer 3 — Business Logic (Services)

Pure TypeScript classes. No UI imports. No Supabase imports. Handles all validation, transformation, and decision logic. Receives domain models, returns domain models or throws typed errors.

### Layer 4 — Repository

TypeScript classes. The only layer that imports Supabase. Responsible for all DB calls and bidirectional mapping between DB row types (snake_case) and domain models (camelCase). Each repository corresponds to exactly one table.

### Layer 5 — Core

Shared types, interfaces, constants, and utilities. Imported by all layers. Never imports from any other layer.

---

## Project Overview

**SubsTrack** is a multi-tenant subscription management mobile application built for small businesses (ISPs, gyms, delivery services) that collect monthly fees from customers. Staff log in, manage customer lists, assign subscription plans, and record monthly payments. The system tracks which customers have paid and which are overdue using a dynamically generated monthly grid — months are never stored in the database, only payments are.

There are **two separate Expo React Native apps** in this workspace:

- `SubsTrack/` — The main tenant-facing app. Staff (admin + user roles) manage customers, payments, plans, and users.
- `SuperAdmin/` — A separate internal admin app for the SaaS owner to manage tenants and SaaS tiers (which configure grace periods, user/customer limits, etc.).

Additionally:

- `sql scripts/` — `script.sql` (schema + RLS setup), `reset.sql` (teardown)
- `plan.md` — Full feature specification (source of truth for requirements)
- `Design/` — Design assets
- `QA/` — QA materials

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
yarn deploy-create-user-edge-function  # Deploy Supabase Edge Function

# SuperAdmin
cd SuperAdmin
yarn install
yarn start
```

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

## Directory Structure: SubsTrack

```
SubsTrack/
├── app/                           # Expo Router navigation
│   ├── _layout.tsx                # Root layout (font loading, GestureHandler)
│   ├── index.tsx                  # Entry: redirects to login or home
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   └── login.tsx              # Login route
│   └── (app)/
│       ├── _layout.tsx            # Auth guard (checks authStore, tenantActive)
│       └── (tabs)/
│           ├── _layout.tsx        # Bottom tab bar (role-aware)
│           ├── admin/
│           │   ├── dashboard.tsx  # Dashboard route (admin only)
│           │   ├── plans.tsx      # Plans list route
│           │   ├── users.tsx      # Users list route
│           │   └── index.tsx      # Redirect to dashboard
│           ├── customers/
│           │   ├── index.tsx      # Customer list
│           │   └── [id].tsx       # Customer detail + payment grid
│           └── settings/
│               └── index.tsx      # Language & user info
│
├── src/
│   ├── core/                      # Shared — imported by all layers
│   │   ├── types/
│   │   │   ├── index.ts           # Domain models (camelCase)
│   │   │   └── db.ts              # DB row types (snake_case) — never leave repository
│   │   ├── constants/index.ts     # PAGE_SIZE=30, MONTHS array, EXPOSED_ROLES
│   │   ├── utils/
│   │   │   ├── BaseRepository.ts  # Abstract base class; holds supabase client + handleError()
│   │   │   └── date.ts            # toBillingMonth, getCurrentYearMonth, isBeforeStartDate
│   │   └── i18n/
│   │       ├── index.ts           # i18next setup
│   │       ├── languageStore.ts   # Zustand store for language preference
│   │       ├── useAppFont.ts      # Font loader hook (Cairo for Arabic, System for English)
│   │       └── locales/{en,ar}.json
│   │
│   ├── modules/                   # Feature modules
│   │   ├── auth/
│   │   │   ├── repository/AuthRepository.ts    # signIn, getSession, getUserProfile, getTenant, signOut
│   │   │   ├── services/AuthService.ts         # login(), restoreSession(), logout()
│   │   │   ├── store/authStore.ts              # user, tenantActive, loading, setDisplayCurrency()
│   │   │   ├── screens/LoginScreen.tsx
│   │   │   ├── screens/TenantInactiveScreen.tsx
│   │   │   └── hooks/useAuth.ts
│   │   │
│   │   ├── currencies/
│   │   │   ├── repository/CurrencyRepository.ts  # CRUD + countReferences (joins plans + payments)
│   │   │   ├── services/CurrencyService.ts       # validation; deleteCurrency() hard- or soft-deletes
│   │   │   ├── store/currencyStore.ts            # currencies[], CRUD, fetched after login
│   │   │   └── components/{CurrencyCard, UsdBaseCard, CurrencyFormSheet}.tsx
│   │   │
│   │   ├── branches/
│   │   │   ├── repository/BranchRepository.ts    # CRUD + countReferences (joins users + customers + plans)
│   │   │   ├── services/BranchService.ts         # validation; deleteBranch() hard- or soft-deletes
│   │   │   ├── store/branchStore.ts              # branches[], CRUD, fetched after login (parallel to currencies)
│   │   │   └── components/{BranchCard, BranchFormSheet}.tsx
│   │   │
│   │   ├── tenant-settings/
│   │   │   └── screens/TenantSettingsScreen.tsx  # admin-only: display currency + branches CRUD + currencies CRUD
│   │   │
│   │   ├── customers/
│   │   │   ├── repository/CustomerRepository.ts
│   │   │   ├── services/CustomerService.ts
│   │   │   ├── store/customerStore.ts
│   │   │   ├── screens/CustomerListScreen.tsx
│   │   │   ├── screens/CustomerDetailScreen.tsx
│   │   │   └── components/{CustomerCard, CustomerDetailsCard, CustomerFormSheet}.tsx
│   │   │
│   │   ├── customer-payments/                    # (note: directory name is customer-payments)
│   │   │   ├── repository/PaymentRepository.ts
│   │   │   ├── services/PaymentService.ts        # ← buildMonthGrid() lives here ONLY
│   │   │   ├── store/paymentStore.ts
│   │   │   └── components/{MonthGrid, MonthCell, YearNavigator, PaymentFormSheet,
│   │   │                    PaymentDetailSheet, VoidSheet, CustomerPaymentPanel}.tsx
│   │   │
│   │   ├── plans/
│   │   │   ├── repository/PlanRepository.ts
│   │   │   ├── services/PlanService.ts
│   │   │   ├── store/planStore.ts
│   │   │   ├── screens/PlanListScreen.tsx
│   │   │   └── components/{PlanCard, PlanFormSheet}.tsx
│   │   │
│   │   ├── users/
│   │   │   ├── repository/UserRepository.ts    # create calls edge function create-user
│   │   │   ├── services/UserService.ts
│   │   │   ├── store/userStore.ts
│   │   │   ├── screens/UserListScreen.tsx
│   │   │   └── components/{UserCard, UserFormSheet}.tsx
│   │   │
│   │   ├── dashboard/
│   │   │   ├── services/DashboardService.ts    # Promise.all() for 6 metrics
│   │   │   ├── store/dashboardStore.ts
│   │   │   ├── screens/DashboardScreen.tsx
│   │   │   └── components/MetricCard.tsx
│   │   │
│   │   └── settings/
│   │       └── screens/SettingsScreen.tsx
│   │
│   └── shared/
│       ├── components/
│       │   ├── Button.tsx, Input.tsx, Text.tsx  # Custom primitives
│       │   ├── CurrencyInput.tsx  # Numeric input + embedded currency dropdown (USD + tenant currencies)
│       │   ├── BranchSelector.tsx # Header chip for tenant-wide admins; self-conceals otherwise
│       │   ├── FormSheet.tsx      # Reusable @gorhom/bottom-sheet wrapper
│       │   ├── ErrorBanner.tsx    # Inline error display (never toast/alert)
│       │   ├── Dropdown.tsx, DatePickerInput.tsx
│       │   ├── SearchTextBox.tsx, EmptyState.tsx
│       │   ├── PageHeader.tsx, LoadingScreen.tsx
│       │   ├── ConfirmDialog.tsx, ErrorBoundary.tsx
│       │   └── DirectionalIcon.tsx  # RTL-aware icon wrapper
│       ├── hooks/useDebounce.ts
│       ├── constants/colors.ts    # Design tokens
│       └── lib/
│           ├── supabase.ts        # Supabase singleton (reads EXPO_PUBLIC_ env vars)
│           ├── storage.ts         # AsyncStorage adapter for Supabase + RTL reload guard
│           ├── uiPrefStore.ts     # Persisted UI prefs (display currency, last-used currency, currentBranchId)
│           └── branchFilter.ts    # resolveBranchFilter(user) / useEffectiveBranchFilter() / applyBranchFilter(query)
│
└── supabase/
    └── functions/create-user/index.ts   # Deno edge function: atomically creates auth.users + public.users
```

---

## Directory Structure: SuperAdmin

```
SuperAdmin/
├── app/
│   ├── _layout.tsx
│   └── (tabs)/
│       ├── index.tsx          # Tenants list
│       ├── saas-tiers.tsx     # SaaS tiers list
│       └── _layout.tsx
└── src/
    ├── core/types/{index,db}.ts
    ├── core/utils/BaseRepository.ts
    ├── modules/
    │   ├── tenants/{repository,services,store,screens,components}
    │   └── saas-tiers/{repository,services,store,screens,components}
    └── shared/
        ├── components/{Button,Input,ErrorBanner,LoadingScreen,EmptyState,ConfirmDialog}
        └── lib/supabaseAdmin.ts   # Uses SERVICE_ROLE_KEY (bypasses RLS — full DB access)
```

---

## Architecture: Strict 5-Layer Clean Architecture

Dependencies flow **downward only**. No layer imports from a layer above it.

```
Presentation (screens, components)
       ↓
   State (Zustand stores)
       ↓
Business Logic (services)
       ↓
   Repository
       ↓
Database (Supabase)
```

**Layer rules:**

- **Presentation** — reads store state, dispatches store actions. Zero business logic. Zero Supabase calls.
- **State (Zustand)** — holds data arrays + `loading`/`error`. Calls services, never repositories. Never imports another store.
- **Business Logic (Services)** — pure TypeScript classes. No React, no Supabase. All validation, transformation, algorithm logic.
- **Repository** — the **only** layer that imports Supabase. Maps DB row types ↔ domain types. Zero business logic.
- **Core** — types, constants, utils. Imported by all layers. Never imports from any module.

---

## Data Models

### Domain types (`src/core/types/index.ts`) — used everywhere except inside repositories

```typescript
type UserRole = "superadmin" | "admin" | "user";
type MonthStatus = "paid" | "unpaid" | "future" | "before_start";

interface AuthUser {
  id;
  username;
  fullName;
  role;
  active;
  tenantId;
  tenant;
  branchId; // null = tenant-wide admin (sees all branches and unassigned records)
  branch?; // joined Branch row when branchId is not null
}
interface AppUser {
  id;
  username;
  fullName;
  phoneNumber;
  role;
  active;
  tenantId;
  branchId; // null = tenant-wide admin
  createdAt;
}
interface Branch {
  id;
  tenantId;
  name;
  active; // soft-delete flag; preserves history
  createdAt;
  updatedAt;
}
interface Tenant {
  id;
  name;
  tenantCode;
  active;
  createdAt;
}
interface Currency {
  id;
  tenantId;
  code; // e.g. 'LBP', 'EUR' — USD is implicit, never stored
  name; // e.g. 'Lebanese Pound'
  symbol; // e.g. 'ل.ل', '€'
  ratePerUsd; // current rate: 1 USD = this many units
  decimals; // 0–6 (USD=2, LBP=0, ...)
  active; // soft-delete flag; preserves history
  createdAt;
  updatedAt;
}
interface SaasTier {
  id;
  name;
  maxUsers;
  maxCustomers;
  price;
  graceDays;
  tenantId;
  createdAt;
}
interface Plan {
  id;
  name;
  price;
  isCustomPrice;
  durationMonths; // 1–12; how many consecutive months the plan covers
  currencyId; // currency the stored price is in; null = USD
  branchId; // null = SHARED catalog item (visible to every branch)
  tenantId;
  createdAt;
}
interface Customer {
  id;
  name;
  phoneNumber;
  address;
  area; // optional free-text neighborhood/zone label (searchable on customer list)
  notes; // optional free-text staff notes (rendered in CustomerDetailsCard)
  active;
  isRegular; // true = subscription customer (affects grid colors, unpaid counts); false = occasional
  planId;
  branchId; // null = UNASSIGNED (visible only to tenant-wide admins)
  tenantId;
  startDate;
  cancelledAt;
  createdAt;
  updatedAt;
  plan?;
}
interface Payment {
  id;
  billingMonth;
  amountDue; // snapshot of what was owed at recording time
  amountPaid; // what was actually collected (≤ amountDue; 0 = unpaid slot)
  balance; // generated column: amountDue - amountPaid
  durationMonths; // how many consecutive months this payment covers (≥ 1)
  currencyId; // currency the amounts above are denominated in; null = USD
  ratePerUsdSnapshot; // exchange rate (units of currencyId per 1 USD) frozen at recording time; USD payments store 1
  customerId;
  planId;
  receivedByUserId;
  tenantId;
  paidAt;
  voidedAt;
  voidedBy;
  notes;
  createdAt;
}
interface MonthEntry {
  year;
  month;
  label;
  billingMonth;
  status: MonthStatus;
  payment: Payment | null;
  isGroupSecondary: boolean; // true for months 2+ covered by a multi-month payment
}
interface DashboardMetrics {
  totalCustomers;
  activeCustomers;
  monthlyRevenue;
  unpaidThisMonth;
  totalUsers;
  totalPlans;
}
```

### DB row types (`src/core/types/db.ts`) — snake_case, **never leave the repository layer**

---

## Database Schema (Supabase PostgreSQL)

| Table        | Key columns                                                                                                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenants`    | `id`, `name`, `tenant_code`, `active`                                                                                                                                                                                                                   |
| `saas_tiers` | `id`, `name`, `max_users`, `max_customers`, `price`, `grace_days`, `tenant_id`                                                                                                                                                                          |
| `currencies` | `id`, `tenant_id`, `code`, `name`, `symbol`, `rate_per_usd`, `decimals`, `active`                                                                                                                                                                       |
| `branches`   | `id`, `tenant_id`, `name`, `active`                                                                                                                                                                                                                     |
| `users`      | `id` (= auth.users.id), `username`, `full_name`, `phone_number`, `role`, `active`, `tenant_id`, `branch_id`                                                                                                                                             |
| `plans`      | `id`, `name`, `price`, `is_custom_price`, `duration_months`, `currency_id`, `branch_id`, `tenant_id`                                                                                                                                                    |
| `customers`  | `id`, `name`, `phone_number`, `address`, `area`, `notes`, `active`, `is_regular`, `plan_id`, `branch_id`, `tenant_id`, `start_date`, `cancelled_at`                                                                                                     |
| `payments`   | `id`, `billing_month` (YYYY-MM-01), `amount_due`, `amount_paid`, `balance` (gen), `duration_months`, `currency_id`, `rate_per_usd_snapshot`, `customer_id`, `plan_id`, `received_by_user_id`, `tenant_id`, `paid_at`, `voided_at`, `voided_by`, `notes` |

**Key constraints:**

- `UNIQUE(username, tenant_id)` on users
- `UNIQUE(tenant_id, branch_id, name)` on plans — same plan name can coexist as "Shared" + branch-specific (NULLs are unequal in PG)
- `UNIQUE(tenant_id, name)` on branches
- `UNIQUE(tenant_id, code)` on currencies; `code` is enforced uppercase and not 'USD'
- `UNIQUE(customer_id, billing_month)` on payments (enforced at DB level and in PaymentService)
- `plan_id` on customers: `ON DELETE SET NULL`
- `customer_id` on payments: `ON DELETE CASCADE`
- `branch_id` on users / customers / plans: `ON DELETE SET NULL` (deleting a branch reverts records to "unassigned" / "shared")
- `currency_id` on plans and payments: `ON DELETE RESTRICT` (use `active = false` soft-delete on currencies instead)

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

| Table         | `branch_id IS NULL` means                                                |
| ------------- | ------------------------------------------------------------------------ |
| `users`       | Tenant-wide admin (sees all branches and unassigned records).            |
| `customers`   | UNASSIGNED — visible only to tenant-wide admins.                          |
| `plans`       | SHARED catalog item — visible to every branch.                            |
| `payments`    | (no `branch_id` column — inherits from customer via FK + JOIN)            |

**RLS layered on tenant_id:**

- `public.current_branch_id()` reads `users.branch_id` for the calling user (SECURITY DEFINER).
- Policies admit a row when `tenant_id` matches AND either the caller is tenant-wide (`current_branch_id() IS NULL`) or the row's branch matches. Plans additionally admit `branch_id IS NULL` (shared) for everyone.
- Payments inherit via `EXISTS (SELECT 1 FROM customers c WHERE c.id = payments.customer_id AND c.branch_id = current_branch_id())`.
- Branch switching for tenant-wide admins is purely UI state in `uiPrefStore.currentBranchId` — no JWT change.

**UI:**

- [BranchSelector](SubsTrack/src/shared/components/BranchSelector.tsx) is a chip rendered below `PageHeader` on Customers/Dashboard/Plans/Users. It self-conceals: only renders for tenant-wide admins (`user.branchId === null`) when ≥1 active branch exists.
- Options: All Branches (`null`) / each active branch / Unassigned (`BRANCH_FILTER_UNASSIGNED`).
- `useEffectiveBranchFilter()` / `resolveBranchFilter(user)` in [branchFilter.ts](SubsTrack/src/shared/lib/branchFilter.ts) returns the active filter: branch-scoped users always get their own `branchId`; tenant-wide admins get `uiPrefStore.currentBranchId`.
- `applyBranchFilter(query, filter, column?)` mutates a supabase query builder: `null` → no-op, `BRANCH_FILTER_UNASSIGNED` → `.is(column, null)`, UUID → `.eq(column, uuid)`.

**Form behavior:**

- CustomerFormSheet: Branch picker only shown to tenant-wide admins. Branch-scoped users auto-assign their own branch. The plan dropdown filters to `branch_id IS NULL OR branch_id = selected_branch`.
- PlanFormSheet: Branch picker only for tenant-wide admins; nullable (= Shared). Branch-scoped admins always create branch-scoped plans (their own).
- UserFormSheet: Branch picker for tenant-wide admin. Once ≥1 branch exists, role=`user` requires a branch (enforced in `UserService.validate`). The `create-user` edge function additionally validates and forces branch_id for branch-scoped callers.

---

## Authentication Flow

```
app/index.tsx
  → authStore.restoreSession()   (on mount)
  → if no session → redirect to (auth)/login
  → if session → redirect to (app)/(tabs)/customers

LoginScreen
  → authStore.login(username, tenantCode, password)
  → AuthService: email = `${username}@${tenantCode}.com`
  → AuthRepository.signIn(email, password)   [Supabase Auth]
  → AuthRepository.getUserProfile(userId)    [public.users]
  → AuthRepository.getTenant(tenantId)       [tenants]
  → stores AuthUser + tenantActive in authStore

app/(app)/_layout.tsx
  → if !user → redirect to login
  → if !tenantActive → show TenantInactiveScreen
  → otherwise → render tabs
```

---

## Critical Business Logic: Month Grid

**`PaymentService.buildMonthGrid(customer, payments, year, graceDays)`** — the **single source of truth** for month status. No other file may reimplement this.

```
Status algorithm per month:
1. month < customer.startDate          → "before_start" (gray, non-tappable)
2. payment exists AND voidedAt === null → "paid" (green for regular, yellow for non-regular)
3. month is in the future              → "future" (gray)
4. now ≤ first-of-month + graceDays    → "future" (gray, within grace window)
5. otherwise                           → "unpaid" (red for regular, light gray for non-regular)
```

- Months are **never stored in DB** — generated dynamically from the payment list for a given year.
- Voided payments are invisible to the grid (treated as non-existent).
- `graceDays` comes from `SaasTier` (fetched during auth flow).
- Multi-month payments build a **coverage map**: each payment with `durationMonths > 1` covers consecutive months. Months 2+ in a block have `isGroupSecondary = true` and display "Included" instead of "Paid".
- `customer.isRegular` controls grid cell colors and unpaid banner visibility.

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

## Multi-Currency

The app supports an arbitrary list of non-USD currencies per tenant. USD is the implicit base — never stored in the `currencies` table.

**Storage model: amount is as-typed, paired with `currency_id`.**

- `plans.price` + `plans.currency_id` — the price was literally `89000` in LBP (not 1.00 USD). Plan USD equivalents use the **live** rate (forward-looking pricing).
- `payments.amount_due` / `amount_paid` + `payments.currency_id` + `payments.rate_per_usd_snapshot` — the customer literally handed over `89000 LBP`. **The LBP value is preserved forever**, and the USD equivalent is also frozen: every payment captures `currencies.rate_per_usd` at recording time into `rate_per_usd_snapshot`. PaymentDetailSheet, CustomerPaymentPanel year totals, and Dashboard aggregates all convert via this snapshot — they do not drift when the live rate is edited.
- `null currency_id` means USD throughout the codebase; USD payments store snapshot = 1.

**Conversion helpers** ([src/core/utils/currency.ts](SubsTrack/src/core/utils/currency.ts)):

```ts
toUsd(amount, source: Currency | null): number       // null source → amount unchanged
fromUsd(amountUsd, target: Currency | null): number  // null target → amount unchanged
convert(amount, source, target): number              // go via USD
formatMoney(amount, source, target, locale): string  // convert + Intl.NumberFormat
findCurrency(currencies, id | null): Currency | null
paymentSnapshotCurrency(payment, currencies): Currency | null  // returns the source Currency with ratePerUsd overridden by the payment's snapshot — use everywhere a historical payment amount is displayed
```

**`CurrencyInput`** ([src/shared/components/CurrencyInput.tsx](SubsTrack/src/shared/components/CurrencyInput.tsx)) — the reusable input with an embedded currency dropdown. Used in PlanFormSheet (price) and PaymentFormSheet (custom amounts). The dropdown lists USD + active tenant currencies. Switching currency does NOT convert the typed number — switching means "I meant this number in the new currency."

**Display preference** is per-user, stored in **AsyncStorage** via `uiPrefStore.displayCurrencyId` (settable from Tenant Settings — no DB column). All read-only displays (PlanCard, DashboardScreen, admin/index revenue card, CustomerPaymentPanel year summary) convert their values to this currency at render. The currency a value was **stored in** is preserved in PaymentDetailSheet's primary line for receipt fidelity, with the user's display-currency equivalent as a secondary "≈" line.

**Aggregates** (Dashboard) sum across mixed currencies by converting each row to USD using its `rate_per_usd_snapshot` (drift-free historical totals) in `DashboardService.getMetrics()`. The screen then formats the USD total in the user's display currency.

**Last-used currency** persists in [src/shared/lib/uiPrefStore.ts](SubsTrack/src/shared/lib/uiPrefStore.ts) so the `CurrencyInput` dropdown defaults to whatever the user typed in last time.

**Currency deletion** is safety-guarded: `CurrencyService.deleteCurrency()` counts references in `plans` + `payments`. If non-zero, it does a soft-delete (sets `active = false`); otherwise it hard-deletes. `ON DELETE RESTRICT` on the FKs prevents any chance of orphaning historical data.

## Regular Customer

`Customer.isRegular` (default `true`) distinguishes subscription customers from occasional ones.

| Behavior                    | Regular (`isRegular = true`)   | Non-regular (`isRegular = false`) |
| --------------------------- | ------------------------------ | --------------------------------- |
| Paid cell color             | Green                          | Yellow/Gold                       |
| Unpaid cell color           | Red                            | Light gray                        |
| Unpaid banner shown         | Yes (current month, if unpaid) | No                                |
| Counted in "unpaid" tab     | Yes                            | No                                |
| Dashboard `unpaidThisMonth` | Counted                        | Excluded                          |

---

## State Management Pattern (Zustand)

Every store follows this exact pattern:

```typescript
interface FeatureState {
  data: DataType[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  create: (input: InputType) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const useFeatureStore = create<FeatureState>((set, get) => ({
  data: [],
  loading: false,
  error: null,
  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const data = await featureService.getData();
      set({ data, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
  clearError: () => set({ error: null }),
  reset: () => set({ data: [], loading: false, error: null }),
}));
```

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

---

## Supabase Edge Function: `create-user`

Located at `SubsTrack/supabase/functions/create-user/index.ts` (Deno runtime).

- Atomically creates both `auth.users` and `public.users` rows.
- Verifies caller is an admin via their JWT.
- Enforces tenant isolation — admin can only create users in their own tenant.
- Rolls back the `auth.users` entry if `public.users` insert fails.
- Deploy: `yarn deploy-create-user-edge-function` (from inside `SubsTrack/`)

---

## Styling

- NativeWind (Tailwind) classnames on all components.
- Design tokens in `src/shared/constants/colors.ts`.
- Custom `Text` component handles Cairo font for Arabic, system font for English.
- RTL support via `I18nManager`; language change triggers full app reload.

---

## Error Handling

- All async store actions wrap in try/catch → set `error: string | null`.
- Screens display errors via `<ErrorBanner>` — inline, never toast/alert.
- `clearError()` is called on user input or form unmount.
- Raw Supabase errors are caught in repositories and converted to user-friendly messages.
- `"account_not_configured"` is a special error code from AuthService that triggers specific UI.

---

## Non-Obvious Patterns & Gotchas

1. **Payments use upsert** — the `UNIQUE(customer_id, billing_month)` constraint means re-paying a voided month upserts the existing row (nullifies `voided_at`), not inserts a new one.

2. **Payment amount is a snapshot** — stored at recording time, never recomputed from `plan.price`. Historical amounts survive plan changes or deletions.

3. **`superadmin` role exists in DB but is not exposed in SubsTrack** — it appears in `UserRole` type but is filtered from the user management UI. Only the SuperAdmin app uses it.

4. **Login email is synthetic** — `username@tenantcode.com` is a convention for unique identification in Supabase Auth, not a real email.

5. **Language change reloads the app** — Arabic requires RTL layout via `I18nManager`, which needs a reload. This is handled in `storage.ts`.

6. **In-flight guard for double-tap** — stores check `if (get().loadingCreate) return` before proceeding to prevent duplicate payment submissions.

7. **Year-scoped payment loading** — `paymentStore` fetches payments only for the displayed year. Navigating years triggers new fetches (cached by year).

8. **`before_start` is a 4th month status** — months before `customer.startDate` are non-tappable and shown gray regardless of other logic.

9. **No cross-store imports** — if a store action needs data from another module, it receives it as a parameter (e.g. `paymentStore.createPayment(data, customer, graceDays)`).

10. **SuperAdmin uses service role key** — `supabaseAdmin.ts` bypasses RLS entirely, giving full DB access. This is intentional for the SaaS owner's admin operations.

11. **Cairo font for Arabic** — loaded via `expo-font` at root layout; `useAppFont` hook applies it. The custom `Text` component selects font family per current language.

12. **`billing_month` is always YYYY-MM-01** — the first day of the month, always. Validated in PaymentService before insert.

13. **Multi-month payments store the bundle price, not per-month** — `payment.amount` is the total bundle price. The `durationMonths` field on the payment record tells the grid how many consecutive months are covered from `billingMonth` forward.

14. **`isGroupSecondary` flag in MonthEntry** — months 2+ in a multi-month payment block have `isGroupSecondary = true`. The grid uses this for visual merging (no gap between cells, "Included" sublabel) and to prevent double-tapping secondary months.

15. **Multi-month conflict resolution** — `createMultiMonthPayment` shifts `effectiveStart` and reduces `effectiveDuration` when leading months are already paid. The recorded payment starts at the first uncovered month, not the requested start, and covers only the remaining months in the original block.

16. **Non-regular customers never appear in unpaid counts** — dashboard `unpaidThisMonth` and the "Unpaid" tab filter only query regular (`is_regular = true`) active customers. Non-regular customers can still have payments recorded normally.

17. **EmptyState first-data button** — `EmptyState` accepts an optional `onAction` + `actionLabel` prop. Lists (plans, customers, users) pass these to render a "Create First X" button when the list is empty and the user is not actively searching.

18. **`null currency_id` means USD** — every money column (`plans.price`, `payments.amount_due`/`amount_paid`, `users.display_currency_id`) treats `null` as USD. USD is never inserted as a `currencies` row.

19. **CurrencyInput does NOT convert on currency change** — switching the dropdown from USD to LBP keeps the typed `100` literal, reinterpreting it as `100 LBP`. This is correct because the user is saying "I meant this number in the other unit," not "convert what I typed."

20. **Display currency lives in AsyncStorage, not the DB** — `uiPrefStore.displayCurrencyId` (persisted via Zustand `persist` + `AsyncStorage`). There is no `display_currency_id` column on `users`. This keeps it a pure UI preference that doesn't round-trip through Supabase on every session restore.

21. **`rate_per_usd_snapshot` freezes payment USD value** — every payment row carries `rate_per_usd_snapshot`, the live `currencies.rate_per_usd` at the moment the payment was recorded. PaymentDetailSheet (receipt), CustomerPaymentPanel year total, and Dashboard aggregates all convert via this frozen rate, so editing a currency's live rate never retroactively shifts historical USD values. USD payments (`currencyId === null`) store snapshot = 1. **Plan prices** still use the live rate (forward-looking pricing — that's the desired behavior). The snapshot is captured at the boundary: `PaymentFormSheet` resolves the `Currency` from `useCurrencyStore` and passes it into `paymentStore.createPayment` / `createMultiMonthPayment`, which extract `currency?.ratePerUsd ?? 1` and forward to `PaymentService`. **Editing** a payment also re-snapshots: `PaymentService.updatePayment(id, amountDue, amountPaid, currency)` recomputes `ratePerUsdSnapshot` from the (possibly newly chosen) currency at edit time, so historical USD totals reflect the corrected record. Use the `paymentSnapshotCurrency(payment, currencies)` helper in `src/core/utils/currency.ts` when displaying a payment — it clones the live `Currency` with `ratePerUsd` overridden by the snapshot.

22. **Dashboard aggregates in USD using snapshots** — `DashboardService.getMetrics()` fetches `{amount, rate_per_usd_snapshot}` rows for the month and divides each by its snapshot before summing. The screen then re-formats the USD total into the user's display currency. No live-currencies lookup is needed for the sum — the snapshot is the rate.

23. **`authStore.restoreSession` / `login` prime the currency store** — after auth succeeds, `useCurrencyStore.fetchCurrencies()` is called so all downstream `CurrencyInput`s and formatters have data immediately. `logout` resets the currency store.

24. **`currencies.code` is uppercase A-Z, 2-8 chars, and never 'USD'** — enforced by a CHECK constraint and validated again in `CurrencyService.validate()`.

25. **Quick Pay `?quickPay=1` handshake** — the customer list dispatches Scenario C (no plan / custom-price) Quick Pay taps by navigating to `customers/[id]?quickPay=1`. `CustomerPaymentPanel` reads the param, waits for `monthGrid` to load, then auto-selects the current-month entry and opens `PaymentFormSheet`. A `useRef` guard ensures it fires once per mount; `router.setParams({ quickPay: undefined })` clears the param so refresh/back navigation doesn't re-trigger. Scenarios A (single-month fixed) and D (multi-month) bypass this and call `paymentStore.createPayment` / `createMultiMonthPayment` directly from the list — D shows a `ConfirmDialog` first to explicitly disclose the bundle range.

26. **`branch_id NULL` means different things on different tables** — on `users` it's a tenant-wide admin; on `customers` it's UNASSIGNED (hidden from branch-scoped users); on `plans` it's SHARED (visible to everyone). Always check the table when reasoning about a `branch_id IS NULL` row.

27. **Tenant-wide admin = `users.branch_id IS NULL`** — there is no separate role for them. Any admin without a branch is effectively a "super admin" for the tenant. Multiple are allowed. The existing SaaS-level `superadmin` role (separate SuperAdmin app) is unrelated.

28. **Branch filter is purely UI state** — `uiPrefStore.currentBranchId` (persisted to AsyncStorage). RLS lets tenant-wide admins see everything; the app passes `?branch=X` filters per-query to narrow the view. Branch-scoped users ignore `currentBranchId` and always see only their branch (their `users.branch_id` is the only possible filter, enforced by RLS).

29. **`BranchSelector` self-conceals** — it returns `null` for branch-scoped users and for tenants with fewer than 2 active branches. Screens render `<BranchSelector />` unconditionally below their `PageHeader`; the component decides whether to appear. The same "≥2 active branches" gate is exposed as `useIsMultiBranchActive()` in [BranchPicker.tsx](SubsTrack/src/shared/components/BranchPicker.tsx) and shared with `BranchPicker` so every dropdown / picker / filter hides in lockstep.

30. **New tenants auto-get a "Default Branch"** — [TenantService.createTenant](SuperAdmin/src/modules/tenants/services/TenantService.ts) inserts a `Default Branch` row right after the tenant row, before the admin auth user is created. `branches.tenant_id` has `ON DELETE CASCADE` so the existing rollback paths still clean up correctly.

31. **Single-branch tenants behave as if branches don't exist** — with exactly 1 active branch, `BranchSelector` + every `BranchPicker` hide. Form sheets auto-bind new records to that lone branch (`CustomerFormSheet`, `PlanFormSheet`, `UserFormSheet` for `role='user'`). `UserFormSheet` toggles `branchId` back to `null` when the role flips to `admin` because admins remain tenant-wide. The auto-fill applies only on *create*, never on edit. The Branches admin CRUD screen stays reachable so admins can add a 2nd branch and activate multi-branch UI.

---

## Code Quality & Architecture

- Write clean, readable, and maintainable code at all times — clarity beats cleverness.
- If the cleanest and scalable solution is to make a big change, do it rather than applying band-aid fixes.
- Follow SOLID principles strictly:
  - **S** — Each file/class/function has one clear responsibility.
  - **O** — Extend behavior without modifying existing, working code.
  - **L** — Subtypes must be substitutable for their base types.
  - **I** — Prefer small, focused interfaces over large, general-purpose ones.
  - **D** — Depend on abstractions, not concrete implementations.

## Dependencies

- Introduce a library when it meaningfully reduces complexity or risk — don't reinvent the wheel.
- Choose the library that best fits the app's existing ecosystem (size, maintenance status, community, license, TypeScript support).
- Prefer well-maintained, widely adopted packages over niche alternatives unless there's a strong reason.
- Always check if a suitable library is already installed before adding a new one.

## Simplicity

- Default to the simplest solution that correctly solves the problem — avoid over-engineering.
- If a piece of logic feels complex, stop and rethink. There is almost always a simpler path.
- Avoid premature abstraction — only generalize when a pattern clearly repeats.
- Write code that a new team member could understand without needing an explanation.

## Consistency

- Before implementing anything, scan the surrounding codebase to understand existing patterns, naming conventions, and structure.
- Match what's already there — file organization, function style, error handling, state management, etc.
- When in doubt, be consistent with the existing code over following a personal preference.
- If an existing pattern appears to be an anti-pattern, flag it with a comment rather than silently diverging from it.

## Plan.md

- When a new feature is introduced, update `plan.md` to reflect the current implementation.

---

## QA

- When any new scenario is added, add the test plan scenarios for it.

## Critical Non-Negotiable Rules

1. **Month status logic lives ONLY in `PaymentService.buildMonthGrid()`** — never reimplement elsewhere.
2. **`tenant_id` always from the Supabase JWT** — never from client-supplied input.
3. **DB row types (snake_case) never escape the repository layer.**
4. **No business logic in components or stores.**
5. **No direct Supabase calls outside the repository layer.**
6. **RLS enforces multi-tenancy** — app-level filtering is secondary.
7. **No hard deletes** — use `voided_at` for payments, `active = false` / `cancelled_at` for customers.
8. **Payment amount is a snapshot** — never recompute from `plan.price` after recording.
9. **No cross-store state sharing** — pass data as parameters to actions.
10. **All errors caught and stored in state** — never surface raw Supabase error messages to the user.
