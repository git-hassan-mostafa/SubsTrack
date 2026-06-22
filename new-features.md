# SubsTrack — New Features Roadmap

All features discussed and evaluated for the SubsTrack product. Organized by category with details on purpose, schema impact, and priority.

---

## Priority Legend

- 🔴 **High** — Critical for market fit or daily workflow. Should be built before launch.
- 🟡 **Medium** — Adds meaningful value. Build in the first growth phase.
- 🟢 **Low** — Nice-to-have or advanced. Build when the core is stable.

---

## 1. Schema Decisions (Make Before Launch)

These require DB schema changes that are expensive to apply retroactively.

---

### 1.1 Partial Payments ✅

**Priority:** 🔴 High

**Purpose:** Allow recording that a customer paid only part of their due amount. Very common in Lebanon — "he paid half this month." Enables running debt tracking per customer.

**Schema changes:**

```sql
payments:
  + amount_due      NUMERIC  -- what was owed at the time of recording
  + amount_paid     NUMERIC  -- what was actually collected (replaces current `amount`)
  + balance         NUMERIC GENERATED ALWAYS AS (amount_due - amount_paid) STORED
```

**Business logic impact:**

- `buildMonthGrid()` still marks the month as "paid" (cell is green/yellow) but shows a debt indicator if `balance > 0`.
- Dashboard `unpaidThisMonth` and debt aging reports use `balance`.
- A payment with `amount_paid = 0` is treated the same as no payment (unpaid).

---

### 1.2 Dual Currency (USD / LBP) ✅

**Priority:** 🔴 High (Lebanon-specific)

**Purpose:** Lebanese businesses price in USD but sometimes collect in LBP. Staff need to record the exchange rate used at collection time. Historical amounts must reflect the rate at the time they were recorded — never recomputed.

**Schema changes:**

```sql
tenants:
  + default_currency  TEXT DEFAULT 'USD'
  + display_currency  TEXT DEFAULT 'USD'

plans:
  + currency  TEXT DEFAULT 'USD'

payments:
  + currency       TEXT     -- snapshot: 'USD' or 'LBP'
  + exchange_rate  NUMERIC  -- snapshot: LBP/USD rate at time of recording
```

**Notes:**

- Exchange rate is a snapshot on the payment row, never recomputed (same principle as `amount`).
- Tenants update their current exchange rate in Settings; it pre-fills the payment form.
- All reporting shows amounts in the tenant's `display_currency` with conversion where needed.

---

### 1.3 Branch / Zone Management ✅

**Priority:** 🟡 Medium

**Purpose:** Businesses with multiple locations or ISPs with geographic zones want staff to see only their assigned area. The admin sees everything consolidated.

**Schema changes:**

```sql
CREATE TABLE branches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

users:     + branch_id  UUID REFERENCES branches(id)  -- nullable
customers: + branch_id  UUID REFERENCES branches(id)  -- nullable
expenses:  + branch_id  UUID REFERENCES branches(id)  -- nullable
```

**RLS impact:**

- Staff with a `branch_id` only see customers in their branch.
- Admin role sees all branches.
- Single-branch businesses leave `branch_id` null — fully backward compatible.

---

## 2. Customer Management Enhancements

### 2.1 Customer Notes ✅

**Priority:** 🔴 High

**Purpose:** Free-text field per customer for staff to record context. "Router is on the third floor." "Call before visiting." Builds product stickiness.

**Schema:** `customers: + notes TEXT`

---

### 2.2 Customer Area / Zone ✅

**Priority:** 🔴 High

**Purpose:** Group and filter customers by neighborhood or service zone. Essential for ISPs and delivery services that organize by route.

**Schema:** `customers: + area TEXT`. Searchable from the customer list alongside name/phone/address.

---

### 2.3 Customer Tags

**Priority:** 🟡 Medium

**Purpose:** Custom labels staff can apply — "VIP", "Problem Payer", "Corporate", "Referred". Filterable on the customer list.

**Schema:** `customers: + tags TEXT[]`

---

### 2.4 Customer Referral Source

**Priority:** 🟢 Low

**Purpose:** Track where each customer came from — word of mouth, social media, walk-in. Informs marketing decisions over time.

**Schema:** `customers: + referral_source TEXT`

---

## 3. Payment Enhancements

### 3.1 Advance Payments

**Purpose:** A customer pays 3 months ahead. The system marks future months as paid up front.

**Priority:** 🟡 Medium

**Notes:** Multi-month payments already partially handle this. Needs UI clarification — staff should see that months are "paid in advance" not just "paid."

**Schema:** No new columns needed. Uses existing `billing_month` + `duration_months` on payments.

---

### 3.2 Debt Aging Report

**Priority:** 🔴 High

**Purpose:** List of regular customers sorted by how long they have been unpaid — 1 month overdue, 2 months, 3+ months. ISPs use this to decide who to cut off.

**Schema:** No new columns — derived from existing payments + `buildMonthGrid()` logic.

**Implementation:** New query in `DashboardService` or a dedicated `ReportsService`.

---

## 4. Operational Features

### 4.1 Quick Pay (One-Tap Current Month) ✅

**Priority:** 🔴 High

**Purpose:** Staff collecting payments in the field need speed. A "Pay Now" button on the customer card for the current month — no drilling into the payment grid required.

**Schema:** No changes. UI-only shortcut that calls the existing payment creation flow.

---

### 4.2 Bulk Payment Recording

**Priority:** 🟡 Medium

**Purpose:** End of day a collector has 20 cash payments to record. A checklist-style bulk flow avoids tapping each customer individually.

**Schema:** No changes. Batch calls to existing payment service.

---

### 4.3 Daily Collection Summary

**Priority:** 🟡 Medium

**Purpose:** At end of day: how much cash was collected, by which staff member, broken down by customer. Admin accountability view.

**Schema:** No changes. Query on `payments` filtered by `received_by_user_id` and `paid_at` date.

---

### 4.4 Field Collection Mode

**Priority:** 🟢 Low

**Purpose:** A simplified view for collectors on the street — customer name, current status, and one tap to record payment. All other UI hidden. Reduces errors on mobile in the field.

**Schema:** No changes. UI-only mode toggle.

---

## 5. Equipment / Asset Tracking

### 5.0 Products & One-Off Sales ✅

**Priority:** 🔴 High

**Purpose:** Subscription businesses also sell one-off items — ISP-sold routers, installation fees, gym supplements, deposits. Without this, those sales either inflate a "custom" subscription payment (losing what was actually sold) or go unrecorded entirely. Owners now see combined revenue and per-product reporting.

**Schema:**

```sql
ALTER TABLE tier_plans ADD COLUMN max_products INT;  -- Free: 5, Pro/Business: NULL

CREATE TABLE products (
  id, tenant_id, branch_id (NULL = SHARED — mirrors plans),
  name, description, price, currency_id (NULL = USD),
  active (soft-delete preserves history),
  created_at, updated_at,
  UNIQUE(tenant_id, branch_id, name)
);

CREATE TABLE sales (
  id, tenant_id, branch_id,
  product_id (ON DELETE RESTRICT),
  product_name_snapshot,             -- frozen at sale time
  customer_id (NULL = walk-in),
  recorded_by_user_id,
  quantity, unit_amount,
  total_amount (GENERATED unit_amount * quantity),
  currency_id (NULL = USD),
  rate_per_usd_snapshot,             -- frozen at sale time
  sold_at, created_at,
  voided_at, voided_by, void_reason  -- soft-void only
);
```

**Module layout:**

- `src/modules/products/` — catalog admin CRUD (mirrors plans/)
- `src/modules/sales/` — sale ledger + sale form + customer panel
- `src/state/slices/{products,sales}/` — Zustand slices
- `src/shared/components/AsyncEntityPicker.tsx` — reusable paginated/searchable picker (built specifically to wrap CustomerRepository for the sale's customer picker; reusable for any large-entity list)

**Notes:**

- Sales are tied to a customer optionally — walk-in sales are supported.
- No stock tracking in v1 — just a price catalog + sale log.
- Tier-gated via `tier_plans.max_products` (Free: 5, Pro/Business: unlimited).
- Dashboard `monthlyRevenue` now = subscription revenue + sales revenue, with a sub-breakdown rendered when sales are non-zero.
- Snapshot principle (CLAUDE.md gotcha #21) applies: `product_name_snapshot`, `unit_amount`, and `rate_per_usd_snapshot` are frozen at sale time so receipts and historical USD totals never drift.
- Branch-scoped semantics mirror plans: `branch_id IS NULL` = SHARED catalog item visible to every branch.

---

### 5.1 Equipment Assigned to Customers

**Priority:** 🟡 Medium (high for ISPs)

**Purpose:** ISPs lend out routers and modems. Track which device (model, serial number) is with which customer, and when it was assigned or returned.

**Schema:**

```sql
CREATE TABLE equipment (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  model         TEXT,
  serial_number TEXT,
  status        TEXT NOT NULL DEFAULT 'assigned',  -- assigned / returned / lost
  assigned_at   TIMESTAMPTZ,
  returned_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

---

## 6. Financial Features

### 6.1 Expense Tracking

**Priority:** 🟡 Medium

**Purpose:** Log monthly business expenses (rent, salaries, internet uplink). Combined with revenue, gives the owner a rough net profit figure without needing separate accounting software.

**Schema:**

```sql
CREATE TABLE expenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  branch_id    UUID REFERENCES branches(id),
  recorded_by  UUID REFERENCES users(id),
  description  TEXT NOT NULL,
  category     TEXT,  -- rent / salary / uplink / maintenance / other
  amount       NUMERIC NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'USD',
  expense_date DATE NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

---

### 6.2 Plan Price History

**Priority:** 🟡 Medium

**Purpose:** When a plan's price changes, keep an append-only log. Staff and admin can see what price was in effect at any given time, and customer detail can show "this customer was on the old price."

**Schema:**

```sql
CREATE TABLE plan_price_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  changed_by   UUID REFERENCES users(id),
  old_price    NUMERIC,
  new_price    NUMERIC NOT NULL,
  currency     TEXT NOT NULL,
  changed_at   TIMESTAMPTZ DEFAULT now()
);
```

---

### 6.3 Revenue Reports (Exportable)

**Priority:** 🔴 High

**Purpose:** Monthly revenue summary: total collected, per plan, per branch, per staff member. Exportable to PDF or CSV. This is the "proof of value" that justifies the subscription fee.

**Schema:** No new tables. New `ReportsService` with aggregate queries on existing data.

---

## 7. Communication Features

### 7.1 WhatsApp Reminders

**Priority:** 🔴 High (Lebanon-specific)

**Purpose:** One-tap to send a payment reminder to a customer via WhatsApp. WhatsApp is the primary communication channel in Lebanon. This single feature could be the strongest sales differentiator.

**Implementation:** Uses WhatsApp deep-link (`https://wa.me/<phone>?text=<template>`) as a minimum viable approach. Full WhatsApp Business API integration is a later phase.

**Schema:**

```sql
CREATE TABLE notification_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  name       TEXT NOT NULL,
  channel    TEXT NOT NULL DEFAULT 'whatsapp',  -- whatsapp / sms
  body_ar    TEXT,
  body_en    TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE notification_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID REFERENCES customers(id),
  template_id UUID REFERENCES notification_templates(id),
  sent_by     UUID REFERENCES users(id),
  channel     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'sent',  -- sent / failed
  sent_at     TIMESTAMPTZ DEFAULT now()
);
```

---

### 7.2 SMS Integration

**Priority:** 🟡 Medium

**Purpose:** Universal fallback when WhatsApp is not available. Integrate with an SMS gateway (Twilio or a local Lebanese provider) for automated reminders.

**Schema:** Covered by `notification_templates` + `notification_log` above.

---

### 7.3 Broadcast Message

**Priority:** 🟡 Medium

**Purpose:** Send a reminder to all unpaid customers at once. One action, reaches everyone. Useful for end-of-month collection drives.

**Schema:** No new tables. Batch calls using `notification_log`.

---

## 8. Reporting & Analytics

### 8.1 Churn Tracking

**Priority:** 🟡 Medium

**Purpose:** Month-over-month: new customers joined vs. customers cancelled. Retention rate over time. The metric subscription businesses live and die by.

**Schema:** No changes. Derived from `customers.cancelled_at` and `customers.created_at`.

---

### 8.2 Plan Distribution

**Priority:** 🟢 Low

**Purpose:** Which plans are most popular? How many customers are on each plan? Informs pricing decisions.

**Schema:** No changes. Aggregate query on `customers.plan_id`.

---

### 8.3 Staff Performance

**Priority:** 🟡 Medium

**Purpose:** Which staff member collected the most payments this month? Useful for accountability and commission incentives.

**Schema:** No changes. Aggregate query on `payments.received_by_user_id`.

---

### 8.4 Customer Lifetime Value

**Priority:** 🟢 Low

**Purpose:** Total amount collected from a customer since their start date. Shows who the most valuable customers are.

**Schema:** No changes. Sum of `payments.amount_paid` per customer.

---

## 9. Trust & Compliance

### 9.1 Audit Log

**Priority:** 🔴 High

**Purpose:** Track every create, update, void, and delete action — who did it, when, and what the data looked like before and after. Critical for resolving disputes between staff and admin.

**Implementation:** Postgres triggers populate the table automatically. No app-layer code required for writes.

**Schema:**

```sql
CREATE TABLE audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  performed_by UUID REFERENCES users(id),
  table_name   TEXT NOT NULL,
  operation    TEXT NOT NULL,  -- INSERT / UPDATE / DELETE
  record_id    UUID,
  old_data     JSONB,
  new_data     JSONB,
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

---

### 9.2 Printed Receipt (PDF)

**Priority:** 🔴 High

**Purpose:** A formatted receipt the staff member can hand to the customer or share via WhatsApp. Includes: business name, customer name, amount, month covered, date, staff name.

**Implementation:** Client-side PDF generation using `react-native-pdf-lib` or `expo-print`. No backend required.

**Schema:** No changes.

---

### 9.3 Data Export (Excel / CSV)

**Priority:** 🟡 Medium

**Purpose:** Full export of customers and payment history to Excel or CSV. Removes lock-in anxiety — owners want to know they can get their data out at any time.

**Implementation:** Client-side CSV generation or an edge function returning a file stream.

**Schema:** No changes.

---

## 10. SaaS / Billing

### 10.0 Subscription Tiers (Free / Pro / Business) ✅

**Priority:** 🔴 High

**Purpose:** Monetize the platform. Free tier hooks small businesses for word-of-mouth growth, Pro / Business unlock higher limits and premium features (multi-branch, multi-currency, multi-month plans, longer grace days). Replaces the never-wired `saas_tiers` placeholder.

**Schema changes:**

```sql
-- Global catalog of 3 tier templates (seeded by script.sql)
CREATE TABLE tier_plans (
  id UUID PK,
  code TEXT UNIQUE ('free' | 'pro' | 'business'),
  name TEXT,
  sort_order INT,
  max_customers / max_users / max_plans / max_branches / max_currencies INT NULL,  -- NULL = unlimited
  multi_currency_enabled / multi_month_plans_enabled BOOLEAN,
  grace_days INT,
  price_monthly_usd / price_yearly_usd NUMERIC,
  active BOOLEAN
);

-- Per-tenant FK
ALTER TABLE tenants
  ADD COLUMN tier_id UUID NOT NULL REFERENCES tier_plans(id) DEFAULT (Free),
  ADD COLUMN tier_upgraded_at TIMESTAMPTZ;
```

**Implementation:**

- New `src/modules/subscription/` module: TierService (limit enforcement + typed `TierLimitError`), SubscriptionRepository (fetch tiers + tenant usage + upgrade), subscriptionStore (state + `init` + `upgrade` + `refreshUsage`), SubscriptionScreen (usage bars + tier cards), `UpgradePromptModal` (block dialog when a limit is hit).
- Each feature Service (`createCustomer` / `createUser` / `createPlan` / `createBranch` / `createCurrency` / `createMultiMonthPayment`) now calls `tierService.assertCanCreate(tier, usage, resource)` after its `validate()`.
- The mobile app's `DEFAULT_GRACE_DAYS = 0` constant is gone — grace days come from the current tier via `useGraceDays()`.
- SuperAdmin: `saas-tiers` module deleted; replaced by `tier-plans` module that lets the SaaS owner edit limits / prices on the 3 global tier rows. The Tenant edit form now has a tier picker for manual upgrades (out-of-band billing).
- Upgrade flow performs an instant tier swap today (no billing). Stripe integration is the documented future hook — `tier_plans` has room for `stripe_price_id_*` columns and `tenants` for `stripe_customer_id` without touching call sites.

---

## 11. Long-Term / Strategic Features

### 10.1 Customer Self-Service Portal

**Priority:** 🟢 Low

**Purpose:** A link or QR code a customer can open to see their own payment history and current status. Reduces "am I paid up?" phone calls to staff.

**Implementation:** A separate lightweight web app (Next.js or similar), using Supabase Row-Level Security scoped to the customer's identity. Follows the same pattern as the existing `SuperAdmin` separate app.

---

### 10.2 API Access

**Priority:** 🟢 Low

**Purpose:** Tech-savvy ISPs already have billing systems or CRMs. A documented REST API lets them sync SubsTrack with existing tools and opens a B2B integration market.

**Implementation:** Supabase's auto-generated REST API is a starting point. Needs API key management and rate limiting.

---

### 10.3 White-Label Option

**Priority:** 🟢 Low

**Purpose:** Sell the platform to a reseller or large ISP chain under their own brand. Higher-value deal, less marketing effort per customer.

**Implementation:** Tenant-level theming (logo, primary color) stored in `tenants` table. No new architecture required.

---

## 12. Global Configuration

### 12.1 App Options & Default Lira Rate ✅

**Priority:** 🔴 High (Lebanon-specific)

**Purpose:** Give the SaaS owner a single, app-wide place to configure cross-tenant settings as key/value pairs, and use it to seed a default Lebanese Pound (LBP) currency on every new tenant. The first managed key is `LiraRate` — the default USD→LBP exchange rate (LBP per 1 USD).

**Schema changes:**

```sql
-- Global key/value config (NOT tenant-scoped). Service role writes; authenticated reads.
CREATE TABLE app_options (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key         TEXT NOT NULL UNIQUE,
  value       TEXT,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seeded row (idempotent)
INSERT INTO app_options (key, value, description)
VALUES ('LiraRate', '89000', 'Default USD→LBP rate seeded onto each new tenant''s LBP currency')
ON CONFLICT (key) DO NOTHING;
```

RLS: `app_options_select` → `SELECT` to `authenticated` only. No write policy — only the service role (SuperAdmin + the `create-tenant` edge function) mutates.

**Implementation:**

- **SuperAdmin:** new **Options** tab + `options` module (repository + service + `optionStore` + `OptionsScreen` + `OptionFormSheet`) with full add/update/delete. The key is immutable after creation (only value + description editable).
- **SubsTrack:** new **read-only** `options` module (repository + `OptionService` + `optionSlice` + `useOptionSlice`), primed in `primePostAuth`, reset on `logout`. Keys referenced via `OPTION_KEYS`.
- **Default LBP currency:** both tenant-creation paths (SuperAdmin `TenantService.createTenant` and the public `create-tenant` edge function) auto-seed an `LBP` currency (`decimals 0`, symbol `ل.ل`) with `rate_per_usd` copied from `LiraRate` (fallback `DEFAULT_LIRA_RATE = 89000` if missing/invalid). The seed is a one-time starting value, not a live link — the tenant edits its own LBP rate afterward.

**Notes:**

- The `currencies → tenants` FK cascades on delete, so the existing tenant-creation rollback paths clean up the seeded LBP currency automatically.
- Extensible: add new global keys (feature flags, support contact, etc.) by inserting more `app_options` rows — no schema change.

---

### 12.2 Plan-Upgrade & Self-Service-Signup Flags ✅

**Priority:** 🔴 High

**Purpose:** Let the SaaS owner toggle, app-wide, whether tenants can (a) upgrade their plan in-app and (b) self-create a new workspace — without a deploy. When upgrades are off, tenants are routed to the owner's WhatsApp to request an upgrade (the owner handles billing manually). When self-service signup is off, the "Create workspace" entry point disappears and the server refuses new signups.

**Schema changes:** None — three new `app_options` rows (seeded idempotently):

- `AllowPlanUpgrade` (`'true'`/`'false'`, default `true`)
- `AllowSelfServiceSignup` (`'true'`/`'false'`, default `true`)
- `SupportWhatsAppNumber` (digits, international format)

**Implementation:**

- RLS on `app_options` widened to `anon` + `authenticated` (the signup flag must be readable pre-auth). Options now fetched at app bootstrap (`app/_layout.tsx`) and no longer reset on logout.
- Reusable readers: typed hooks in `useOptionSlice.ts` (`useOptionValue` / `useBooleanOption` + semantic `useCanUpgradePlan` / `useSelfServiceSignupEnabled` / `useSupportWhatsAppNumber`); declarative UI gates `<CanUpgrade>` / `<CanCreateWorkspace>` in `shared/components/FeatureGate.tsx`; `openWhatsApp()` deep-link helper in `shared/lib/whatsapp.ts`; shared `ContactToUpgradeButton` component.
- **Plan upgrade:** `TierCard` + `UpgradePromptModal` render `ContactToUpgradeButton` (WhatsApp, pre-filled message) instead of the upgrade CTA when `AllowPlanUpgrade = false`.
- **Self-service signup:** `LoginScreen` hides "Create workspace"; the public `create-tenant` edge function rejects signups with `403 { code: 'signup_disabled' }` (authoritative server-side gate).
- Configurable from SuperAdmin's existing **Options** tab (generic key/value CRUD) — no SuperAdmin code change.

---

## Summary Table

| Feature                      | Priority  | Schema Change                                                         |
| ---------------------------- | --------- | --------------------------------------------------------------------- |
| Partial payments             | 🔴 High   | Yes — `amount_due`, `amount_paid`, `balance` on payments              |
| Dual currency (USD/LBP)      | 🔴 High   | Yes — `currency`, `exchange_rate` on payments; `currency` on plans    |
| Branch / zone management ✅  | 🟡 Medium | Yes — new `branches` table; `branch_id` on users, customers, plans     |
| Customer notes ✅            | 🔴 High   | Yes — `notes` on customers                                            |
| Customer area/zone ✅        | 🔴 High   | Yes — `area` on customers                                             |
| Customer tags                | 🟡 Medium | Yes — `tags[]` on customers                                           |
| Quick pay (one-tap) ✅        | 🔴 High   | No                                                                    |
| Debt aging report            | 🔴 High   | No                                                                    |
| Daily collection summary     | 🟡 Medium | No                                                                    |
| Bulk payment recording       | 🟡 Medium | No                                                                    |
| Equipment tracking           | 🟡 Medium | Yes — new `equipment` table                                           |
| Expense tracking             | 🟡 Medium | Yes — new `expenses` table                                            |
| Plan price history           | 🟡 Medium | Yes — new `plan_price_snapshots` table                                |
| Revenue reports + export     | 🔴 High   | No                                                                    |
| WhatsApp reminders           | 🔴 High   | Yes — new `notification_templates` + `notification_log` tables        |
| SMS integration              | 🟡 Medium | No (reuses notification tables)                                       |
| Broadcast message            | 🟡 Medium | No                                                                    |
| Audit log                    | 🔴 High   | Yes — new `audit_log` table                                           |
| Printed receipt (PDF)        | 🔴 High   | No                                                                    |
| Data export (CSV)            | 🟡 Medium | No                                                                    |
| Churn tracking               | 🟡 Medium | No                                                                    |
| Staff performance report     | 🟡 Medium | No                                                                    |
| Customer self-service portal | 🟢 Low    | No (separate app)                                                     |
| API access                   | 🟢 Low    | No                                                                    |
| White-label                  | 🟢 Low    | Minor — theming columns on tenants                                    |
| App options + default LBP ✅ | 🔴 High   | Yes — new `app_options` table; auto-seeded `LBP` currency per tenant   |
| Plan-upgrade & signup flags ✅ | 🔴 High | No — three new `app_options` rows                                     |
