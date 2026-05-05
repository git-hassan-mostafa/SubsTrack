# Subscription Management Mobile App — Full Specification

## Objective

Build a multi-tenant subscription management mobile application. Each tenant is a business (e.g. a small ISP, gym, or delivery service) that collects monthly fees from their customers. Staff log in, manage their customer list, assign plans, and record monthly payments.

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

## Folder Structure (MANDATORY)

```
src/
  core/
    types/
      index.ts          # Domain models (camelCase)
      db.ts             # DB row types (snake_case)
    constants/
      index.ts
    utils/
      date.ts
      BaseRepository.ts
  modules/
    auth/
      repository/
      services/
      store/
      screens/
      hooks/
    customers/
      repository/
      services/
      store/
      screens/
      components/
      hooks/
    payments/
      repository/
      services/
      store/
      components/
    plans/
      repository/
      services/
      store/
      screens/
      components/
    users/
      repository/
      services/
      store/
      screens/
      components/
    dashboard/
      store/
      screens/
      components/
  shared/
    components/         # Reusable UI primitives
    hooks/
    lib/
      supabase.ts       # Supabase client singleton
```

---

## Database Schema

### saas_tiers (managed by SaaS owner only, never touched by app)

```
id            uuid pk
name          text
max_users     int
max_customers int
price         numeric(12,2)
tenant_id     uuid fk → tenants unique
created_at    timestamptz
```

### tenants (managed by SaaS owner only)

```
id         uuid pk
name       text
active     boolean default true
created_at timestamptz
```

### users (app-level, mirrors auth.users)

```
id           uuid pk  — same as auth.users.id
username     text
phone_number text nullable
role         text  — 'admin' | 'user'  ('superadmin' exists in DB but never exposed in app)
tenant_id    uuid fk → tenants
created_at   timestamptz
```

Constraint: UNIQUE(username, tenant_id)

### plans (customer subscription packages, per tenant)

```
id              uuid pk
name            text
price           numeric(12,2) nullable
is_custom_price boolean default false
tenant_id       uuid fk → tenants
created_at      timestamptz
```

Constraint: UNIQUE(name, tenant_id)

Rule: if is_custom_price = false, price must not be null and must be > 0.

### customers

```
id           uuid pk
name         text
phone_number text nullable
address      text nullable
active       boolean default true
plan_id      uuid nullable fk → plans (ON DELETE SET NULL)
tenant_id    uuid fk → tenants
start_date   date
cancelled_at timestamptz nullable   — populated when active set to false
created_at   timestamptz
updated_at   timestamptz
```

### payments

```
id                  uuid pk
billing_month       date   — MUST be first day of month (YYYY-MM-01)
amount              numeric(12,2)  — SNAPSHOT, never recomputed
customer_id         uuid fk → customers (ON DELETE CASCADE)
plan_id             uuid nullable fk → plans (ON DELETE SET NULL)
received_by_user_id uuid nullable fk → users (ON DELETE SET NULL)
tenant_id           uuid fk → tenants
paid_at             timestamptz
voided_at           timestamptz nullable   — soft void, never hard delete
voided_by           uuid nullable fk → users
notes               text nullable
created_at          timestamptz
```

Constraint: UNIQUE(customer_id, billing_month) — enforced at DB level, also validated in PaymentService before insert.

---

## Multi-Tenancy Rules (NON-NEGOTIABLE)

- Every table except `saas_tiers` and `tenants` includes `tenant_id`.
- All repository queries filter by `tenant_id` via RLS (Row Level Security). RLS is the primary guard. App-level filtering is a secondary belt-and-suspenders guard.
- `tenant_id` is read from the Supabase JWT claim `tenant_id`, injected at login via a Supabase auth hook.
- Never pass `tenant_id` from the client as a query parameter — always derive it server-side from the authenticated JWT.
- No query may join or reference data from another tenant.

---

## Type System

### Two type files — never mix them

`core/types/db.ts` — raw DB row shapes, snake_case, mirrors the SQL schema exactly. Only used inside repository classes.

`core/types/index.ts` — domain models, camelCase, what the rest of the app works with. Repositories map between these two. No other layer ever sees DB row types.

### Key domain models

```typescript
type UserRole = 'superadmin' | 'admin' | 'user';
type MonthStatus = 'paid' | 'unpaid' | 'future';

interface AuthUser { id, username, role, tenantId }
interface Plan { id, name, price, isCustomPrice, tenantId, createdAt }
interface Customer { id, name, phoneNumber, address, active, planId, tenantId, startDate, cancelledAt, createdAt, updatedAt, plan? }
interface Payment { id, billingMonth, amount, customerId, planId, receivedByUserId, tenantId, paidAt, voidedAt, voidedBy, notes, createdAt }
interface MonthEntry { year, month, label, billingMonth, status: MonthStatus, payment: Payment | null }
```

---

## Core System Concept — Monthly Timeline

Months are NEVER stored in the database. They are generated dynamically in the UI for a given year. Payments are the sole source of truth.

### Month status logic (single source of truth — lives in PaymentService only)

```
if payment exists AND voided_at is null → PAID
else if month is in the future (after current month) → FUTURE
else if within grace period (configurable per tenant, default 0 days) → FUTURE
else → UNPAID
```

### Grace period

`saas_tiers` has a `grace_days` field (integer, default 0). A month is not marked UNPAID until `grace_days` days after the first of that month have passed. This lets tenants configure a collection window before accounts show as overdue.

---

## Authentication

- Supabase Auth handles credentials.
- On successful login, load the app-level `users` row for the authenticated user (gives role + tenant_id).
- Store `AuthUser` in `authStore`. All other stores read `tenantId` and `role` from `authStore`.
- On app start, call `restoreSession()` — if a valid session exists, skip login screen.
- Session expiry: show login screen, clear all stores.

### Edge cases

- Invalid credentials → show field-level error, do not clear password field
- Expired session → redirect to login, show "session expired" message
- Auth user exists but no matching `users` row → show "account not configured" error, sign out

---

## Module Specifications

---

### Module: Plans (admin only)

#### CRUD operations

| Operation | Trigger | Rules |
|-----------|---------|-------|
| Read | Screen load | Load all plans for tenant |
| Create | Admin taps "Add plan" | Name required, unique per tenant. If not custom: price > 0 required. |
| Update | Admin taps plan row | Same rules as create |
| Delete | Admin taps delete | Allowed. ON DELETE SET NULL cascades to customers and payments. |

#### Plan types

**Fixed plan** — `is_custom_price = false`, `price` is set. When recording a payment for a customer on this plan, the amount field is pre-filled and locked (not editable).

**Custom plan** — `is_custom_price = true`, `price` is null. When recording a payment, the user must enter the amount manually every time.

**Optional override plan** — `is_custom_price = false`, `price` is set, but the payment form offers a radio: "Use plan price" or "Enter custom amount". This is Scenario B in the payment flow.

#### Edge cases

- Duplicate plan name within same tenant → reject with inline error
- Deleting a plan that has active customers → allowed, `plan_id` becomes null on those customers (no blocking)
- Price set to 0 or negative on a fixed plan → reject

---

### Module: Users (admin only)

#### CRUD operations

| Operation | Trigger | Rules |
|-----------|---------|-------|
| Read | Screen load | Load all users for tenant |
| Create | Admin taps "Add user" | Username required, unique per tenant. Role must be admin or user. Password min 8 chars. |
| Update | Admin taps user row | Username, phone, role editable. Cannot change own role. |
| Deactivate | (future) | Not in v1 — users are not hard deleted. |

#### Edge cases

- Duplicate username within same tenant → reject
- Admin attempting to change their own role → reject with "cannot change own role"
- Creating a user creates both an `auth.users` entry and a `public.users` row in a single operation

---

### Module: Customers

Both admin and user roles can perform all customer operations.

#### CRUD operations

| Operation | Trigger | Rules |
|-----------|---------|-------|
| Read (list) | Screen load | Paginated, ordered by name. Show unpaid month count next to each customer. |
| Read (detail) | Tap customer | Load customer + their payments for current year |
| Create | Tap "Add customer" | Name required. start_date required. plan_id optional. |
| Update | Tap edit | Name, phone, address, plan_id editable. |
| Deactivate | Tap "Deactivate" | Sets active = false, cancelled_at = now(). NEVER hard deletes. |
| Reactivate | Tap "Reactivate" | Sets active = true, cancelled_at = null. |

#### Customer list display

Each row shows: customer name, plan name (or "No plan"), unpaid month count for current year, active/inactive badge.

#### Edge cases

- Customer without a plan → can still record payments (custom amount required)
- Plan changed mid-year → does not retroactively change existing payment amounts (snapshots)
- Future start_date → months before start_date show as FUTURE regardless of status logic
- Inactive customer → payment recording still allowed (may need to catch up arrears)

---

### Module: Payments

#### Operations

| Operation | Trigger | Rules |
|-----------|---------|-------|
| Read | Customer detail load | Load all non-voided payments for customer |
| Create | Tap unpaid or future month | Full validation (see below) |
| Void | Admin taps "Void" on paid month | Sets voided_at, voided_by, requires notes. Never hard deletes. |

Payments have NO update operation. A wrong payment is voided, then a correct one is created.

#### Payment creation flow

**Step 1 — User taps a month cell**

- If month is PAID (and not voided): open read-only detail sheet showing amount, paid_at, received_by, notes.
- If month is UNPAID or FUTURE: open payment form sheet.

**Step 2 — Determine scenario based on customer's plan**

| Scenario | Condition | Amount field |
|----------|-----------|--------------|
| A — Fixed | Plan exists, is_custom_price = false | Pre-filled with plan.price. Field is read-only. |
| B — Optional override | Plan exists, is_custom_price = false, user wants to override | Radio: "Plan price ($X)" or "Custom". Input shown only if custom selected. |
| C — Fully custom | Plan is_custom_price = true, or customer has no plan | Amount input required. No default. |

Note: Scenario B is triggered when the user taps "Override amount" inside Scenario A. The default is always Scenario A for fixed plans.

**Step 3 — Validation (PaymentService)**

- amount must be > 0
- billing_month must end in '-01' (normalized)
- customer.tenantId must equal current tenantId
- plan (if provided) tenantId must equal current tenantId
- No existing non-voided payment for this customer + billing_month combination

**Step 4 — Insert**

Store: billing_month, amount (snapshot), customer_id, plan_id, tenant_id, received_by_user_id, notes (optional).

**Step 5 — UI update**

Month cell turns green immediately. Payment store updates in-memory list. No full refetch needed.

#### Void flow (admin only)

1. Admin opens a PAID month cell.
2. Taps "Void payment".
3. Must enter a reason (notes field — required for void).
4. Confirmation dialog shown.
5. Sets voided_at = now(), voided_by = current user id, notes = reason.
6. Month cell reverts to UNPAID or FUTURE.

#### Edge cases

- Duplicate payment → rejected by service (checked before insert) and by DB unique index (belt + suspenders)
- Rapid double-tap → guard with in-flight flag in store (set loading = true before async, check before proceeding)
- Future month payment → allowed
- Voided payment → invisible to month grid (status recalculated as if payment doesn't exist)
- Amount = 0 → rejected
- Negative amount → rejected

---

### Module: Dashboard (admin only)

Load on screen focus. All metrics scoped to current tenant.

| Metric | Calculation |
|--------|-------------|
| Total customers | COUNT all customers |
| Active customers | COUNT where active = true |
| Monthly revenue | SUM of non-voided payment amounts for current billing month |
| Unpaid this month | COUNT active customers with no non-voided payment for current billing month |

Use `Promise.all` for parallel queries. Do not use N+1 queries.

---

## Monthly Grid UI

The core screen of the app. Shown inside Customer Detail.

- 12 cells in a grid (3 columns × 4 rows or 4 columns × 3 rows — agent decides based on readability).
- Year navigation: left arrow (previous year), right arrow (next year), year label in center.
- Each cell shows the month abbreviation (Jan, Feb, …) and a color:
  - Green background — PAID
  - Red background — UNPAID
  - Gray background — FUTURE
- Months before the customer's `start_date` always render as gray (FUTURE), regardless of status logic.
- Tapping any cell opens the appropriate bottom sheet (detail or payment form).

---

## State Management Rules

- One Zustand store per module.
- Stores hold: the feature's data array, `loading: boolean`, `error: string | null`.
- No business logic inside stores. Stores call services, put results in state.
- No direct Supabase calls inside stores.
- `clearError()` action on every store.
- Do not share state between stores by importing one store into another. If data is needed across modules, pass it as a parameter to the action.

---

## Repository Layer Rules

- Implemented as TypeScript classes extending `BaseRepository`.
- `BaseRepository` holds the Supabase client and a `handleError()` method.
- Every repository method maps its input from domain types to DB row types before writing, and maps the returned DB row back to a domain type before returning.
- Repositories never throw raw Supabase errors — always convert to `Error` with a clean message.
- Repositories never perform business logic or validation.

---

## Service Layer Rules

- Implemented as TypeScript classes.
- No imports from Supabase, no imports from React.
- All validation happens here and throws descriptive `Error` instances.
- Services instantiate their repository internally (not injected — keep it simple).
- Services are the only place the month status algorithm lives (`buildMonthGrid`).

---

## Validation Rules (enforced in services)

- `amount > 0`
- `billing_month` must be a valid date string ending in `-01`
- Plan must belong to the same `tenantId` as the customer
- Customer must belong to the current `tenantId`
- Username must be non-empty and unique within tenant
- Plan name must be non-empty and unique within tenant
- Fixed plan price must be > 0 and non-null

---

## Error Handling

- Every async store action wraps its call in try/catch and sets `error` state.
- Screens read `error` from the relevant store and display it inline (not in a toast or alert — inline, near the relevant field or at the top of the form).
- `error` is cleared when the user starts interacting again (`clearError()` on input focus or on screen unmount).
- Network errors surface as "Connection error. Please try again." — never expose raw Supabase error messages to the user.

---

## Performance Rules

- Paginate customer list (page size 30).
- On customer detail, load only the payments for the displayed year. When user navigates to a different year, fetch that year's payments (cache by year in the payment store).
- Use `React.memo` on month grid cells.
- Use `useMemo` for month grid calculation.
- Dashboard uses `Promise.all` for parallel metric queries.
- Index: `tenant_id` on all tables, `billing_month` on payments, `customer_id` on payments.

---

## Critical Rules (NON-NEGOTIABLE)

1. NEVER derive payment amount from plan.price after a payment has been recorded. Amount is a snapshot stored at insert time.
2. NEVER store month entries in the database. Generate them dynamically from the year + payment list.
3. ALWAYS enforce tenant isolation. Every query must be scoped to the current tenant.
4. NEVER hard delete payments. Use `voided_at` for corrections.
5. NEVER hard delete customers. Use `active = false` + `cancelled_at` for deactivation.
6. The month status algorithm (paid / unpaid / future) lives in `PaymentService.buildMonthGrid` only. No other file may re-implement this logic.
7. DB row types (snake_case) must never escape the repository layer.
8. `tenant_id` must always come from the authenticated JWT — never from client-supplied input.

---

## Deliverables Expected

- Full Expo React Native app in TypeScript strict mode
- All five modules fully implemented: auth, plans, users, customers, payments, dashboard
- Clean architecture with all five layers
- Supabase integration with RLS enforced
- All CRUD operations per module as specified
- All three payment scenarios (A, B, C)
- Void payment flow
- Monthly grid with correct status logic
- Dashboard metrics
- Inline error handling on all forms
- Edge cases covered as specified above
- NativeWind for styling
- No business logic in components or stores
- No raw DB types outside repository layer
