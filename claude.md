<!-- Do not re-explore the codebase at the start of new sessions. Treat CLAUDE.md as the source of truth for project context and start from it directly. -->

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
│   │   │   ├── store/authStore.ts              # user, tenantActive, loading
│   │   │   ├── screens/LoginScreen.tsx
│   │   │   ├── screens/TenantInactiveScreen.tsx
│   │   │   └── hooks/useAuth.ts
│   │   │
│   │   ├── customers/
│   │   │   ├── repository/CustomerRepository.ts
│   │   │   ├── services/CustomerService.ts
│   │   │   ├── store/customerStore.ts
│   │   │   ├── screens/CustomerListScreen.tsx
│   │   │   ├── screens/CustomerDetailScreen.tsx
│   │   │   └── components/{CustomerCard, CustomerDetailsCard, CustomerFormSheet}.tsx
│   │   │
│   │   ├── payments/
│   │   │   ├── repository/PaymentRepository.ts
│   │   │   ├── services/PaymentService.ts      # ← buildMonthGrid() lives here ONLY
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
│           └── storage.ts         # AsyncStorage adapter for Supabase + RTL reload guard
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
}
interface AppUser {
  id;
  username;
  fullName;
  phoneNumber;
  role;
  active;
  tenantId;
  createdAt;
}
interface Tenant {
  id;
  name;
  tenantCode;
  active;
  createdAt;
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
  tenantId;
  createdAt;
}
interface Customer {
  id;
  name;
  phoneNumber;
  address;
  active;
  planId;
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
  amount;
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

| Table        | Key columns                                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenants`    | `id`, `name`, `tenant_code`, `active`                                                                                                                    |
| `saas_tiers` | `id`, `name`, `max_users`, `max_customers`, `price`, `grace_days`, `tenant_id`                                                                           |
| `users`      | `id` (= auth.users.id), `username`, `full_name`, `phone_number`, `role`, `active`, `tenant_id`                                                           |
| `plans`      | `id`, `name`, `price`, `is_custom_price`, `tenant_id`                                                                                                    |
| `customers`  | `id`, `name`, `phone_number`, `address`, `active`, `plan_id`, `tenant_id`, `start_date`, `cancelled_at`                                                  |
| `payments`   | `id`, `billing_month` (YYYY-MM-01), `amount`, `customer_id`, `plan_id`, `received_by_user_id`, `tenant_id`, `paid_at`, `voided_at`, `voided_by`, `notes` |

**Key constraints:**

- `UNIQUE(username, tenant_id)` on users
- `UNIQUE(name, tenant_id)` on plans
- `UNIQUE(customer_id, billing_month)` on payments (enforced at DB level and in PaymentService)
- `plan_id` on customers: `ON DELETE SET NULL`
- `customer_id` on payments: `ON DELETE CASCADE`

---

## Multi-Tenancy

- **RLS is the primary guard** — all queries automatically scoped to the caller's tenant via Supabase JWT claims.
- **App-level filtering** (`tenant_id` from `authStore`) is a secondary belt-and-suspenders guard.
- `tenant_id` is injected into the JWT by a Supabase auth hook at login. **Never derive it from client input.**
- Login email convention: `username@tenantcode.com` (synthetic, not a real email address).

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
2. payment exists AND voidedAt === null → "paid" (green)
3. month is in the future              → "future" (gray)
4. now ≤ first-of-month + graceDays    → "future" (gray, within grace window)
5. otherwise                           → "unpaid" (red)
```

- Months are **never stored in DB** — generated dynamically from the payment list for a given year.
- Voided payments are invisible to the grid (treated as non-existent).
- `graceDays` comes from `SaasTier` (fetched during auth flow).

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

| Scenario     | Condition                            | Amount field                            |
| ------------ | ------------------------------------ | --------------------------------------- |
| A — Fixed    | Plan exists, `isCustomPrice = false` | Pre-filled with `plan.price`, read-only |
| B — Override | Same as A, user toggles override     | Radio: "Plan price" or "Custom amount"  |
| C — Custom   | `isCustomPrice = true`, or no plan   | Amount input required, no default       |

Payments have **no update operation** — wrong payments are voided, then a new correct one is created.

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
