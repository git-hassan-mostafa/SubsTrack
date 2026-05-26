# SubsTrack — QA Test Documentation

This folder contains the production QA test plan for the SubsTrack mobile app. Each markdown file owns one feature area and lists every test scenario the QA team should execute before sign-off, including happy paths, validation, error states, edge cases, permissions, and platform variations.

## How to use

1. Open the feature you're testing — each scenario is numbered (e.g. `3.4`) for traceability in your test runs.
2. Read the **Reference code** section at the top of each file when you need to confirm the expected behavior in the source.
3. File any deviation against the corresponding scenario number.
4. Cross-cutting concerns (perf, accessibility, i18n, resilience) live in [non-functional.md](non-functional.md) — run them on every release.
5. Multi-tenancy isolation ([multi-tenancy.md](multi-tenancy.md)) is a release blocker. Run it last and confirm zero leakage.

## Files

| Area | File | What it covers |
|------|------|----------------|
| Authentication | [authentication.md](authentication.md) | Login, session restore, tenant inactive, logout |
| Customers | [customers.md](customers.md) | List, search, filter, action menu, Quick Pay, create/edit, delete, deactivate/reactivate, detail (with branch + notes + area + isRegular) |
| Payments | [payments.md](payments.md) | Record (Scenarios A/B/C/D), partial payments, multi-month bundles, multi-currency, edit payment, void, receipt sheet, grace period |
| Monthly Grid | [monthly-grid.md](monthly-grid.md) | Cell statuses, regular vs non-regular colors, partial dot, multi-month merging, year navigation, date/timezone correctness |
| Plans | [plans.md](plans.md) | List, create/edit/delete, fixed vs custom pricing, multi-month bundles (1–12), per-currency price, branch scoping (shared vs branch-specific) |
| Users (Staff) | [users.md](users.md) | List, create/edit, role assignment, password rules, branch enforcement, delete user |
| Currencies | [currencies.md](currencies.md) | Tenant currencies CRUD, USD base, rate per USD + snapshots, CurrencyInput, display currency preference, soft/hard delete |
| Branches | [branches.md](branches.md) | Multi-location: branch CRUD, default branch, single-branch UI hiding, BranchSelector, RLS isolation, form scoping, mandatory branch enforcement |
| Tenant Settings | [tenant-settings.md](tenant-settings.md) | Admin-only hub: display currency preference, links to currencies + branches |
| Dashboard | [dashboard.md](dashboard.md) | Hero card (USD-aggregated via snapshots, display-currency formatted), stat cards, admin compact stats, refresh, branch scoping |
| Settings | [settings.md](settings.md) | User-level prefs: profile, language switcher with restart, logout |
| Admin & Navigation | [admin-and-navigation.md](admin-and-navigation.md) | Tab visibility, role gating, routing, deep links, ActionMenu pattern, PressableOpacity feedback, asterisk required fields |
| Multi-tenancy | [multi-tenancy.md](multi-tenancy.md) | Tenant isolation reads/writes, tenant inactive, workspace code |
| Non-functional | [non-functional.md](non-functional.md) | Performance, accessibility, i18n/RTL, security, resilience |

## Pre-release checklist (high level)

- [ ] All scenarios in [authentication.md](authentication.md) pass.
- [ ] All scenarios in [multi-tenancy.md](multi-tenancy.md) pass — **release blocker.**
- [ ] [Customers](customers.md), [Payments](payments.md), [Monthly Grid](monthly-grid.md) pass for both `admin` and `user` roles.
- [ ] [Plans](plans.md), [Users](users.md), [Dashboard](dashboard.md), [Currencies](currencies.md), [Branches](branches.md), [Tenant Settings](tenant-settings.md) pass for `admin` (and confirm hidden for `user`).
- [ ] [Settings](settings.md) passes including language restart on iOS, Android, and Expo Go.
- [ ] [Non-functional](non-functional.md) sections 1 (performance), 2 (errors), 5 (i18n/RTL), 7 (security), 8 (data integrity) pass.
- [ ] Multi-currency invariants: snapshot rate freeze on payments, live rate edit doesn't shift history, display currency preference persists, USD is implicit (`currency_id = NULL`).
- [ ] Branch invariants: tenants with ≥1 branch require branch on customers/plans/staff users; tenant-wide admins remain the only `branch_id IS NULL` users; new tenants auto-get "Default Branch".
- [ ] Multi-month invariants: bundle creates a single payment row with `duration_months > 1`; `isGroupSecondary` cells render "Included"; conflict detection on overlap.
- [ ] Partial payment invariants: `balance > 0` triggers orange dot + amber receipt; `amount_paid = 0` rendered as unpaid.
- [ ] All identified findings ("verify…", "file a finding…" notes) reviewed and either fixed or signed off as known limitations.

## Test data needed

- At least 2 tenants, both active.
- 1 deactivated tenant for tenant-inactive scenarios.
- At least 3 users per tenant: 1 tenant-wide admin, 1 branch admin, 1 user (staff). 1 superadmin (test fixture).
- 3+ branches in one tenant (e.g. Beirut, Tripoli, Saida) to exercise multi-branch UI; another tenant with only "Default Branch" for single-branch UI.
- 2+ tenant currencies (e.g. LBP, EUR) with non-trivial `rate_per_usd` for snapshot verification.
- 5 plans per tenant: 2 fixed-price single-month, 2 custom-price, 1 multi-month (durationMonths > 1), and at least 1 priced in a non-USD currency.
- 30+ customers in tenant A (to test pagination), mix of: active/inactive, regular/non-regular, assigned/unassigned plans, branched/unbranched.
- Customers with start_dates spanning past, current and future to exercise the monthly grid.
- Existing payments per customer covering: paid full, paid partial, voided, multi-month bundles, multi-year history, mixed currencies.

## Reporting findings

When a scenario fails, capture:
- Scenario id (e.g. `payments.md § 5.3`).
- Steps to reproduce.
- Expected vs actual.
- Device, OS version, app build, tenant id, user id, branch id (if multi-branch tenant).
- Screenshot or screen recording if UI-related.
- Network HAR or Supabase logs if backend-related.

## Open items / verifications

These were called out inside the scenario files and should be resolved before release:

- **Payment void permission gating** — confirm whether the `user` role can void payments via UI or API. (See [payments.md § 10.13](payments.md))
- **Edit Payment permission** — confirm whether the `user` role can edit a payment. (See [payments.md § 9](payments.md))
- **"New This Month" label** on Dashboard — value displayed is `totalCustomers`, not a true monthly count. Reconcile label with intent. (See [dashboard.md § 3.2](dashboard.md))
- **Multi-month coverage in "paid this month"** — verify customers covered by a multi-month bundle are counted as paid in the dashboard for months 2/3 of the bundle. (See [dashboard.md § 8.10](dashboard.md))
- **Hardcoded English strings** in several screens. (See [admin-and-navigation.md § 11.2](admin-and-navigation.md))
- **Currency / Date locale** — verify Arabic vs en-US selection in places where formatting is still hardcoded. (See [non-functional.md § 5.4–5.5](non-functional.md))
- **Accessibility labels** on month cells and avatars not explicitly set. (See [monthly-grid.md § 9.4](monthly-grid.md))
- **Tenant_code migration** must be applied to Supabase before user-creation flow works for new tenants. (See [users.md § 10.11](users.md))
- **Last active branch deletion** — document whether deleting the last active branch is allowed (transitions tenant back to 0-branch) or blocked. (See [branches.md § 4.12](branches.md))
- **Single-branch tenant + role=admin** — clarify whether the form auto-binds branch or lets admin stay tenant-wide. (See [branches.md § 2.6](branches.md))
- **Soft-deleted currency display** in plans and payments — verify the UI gracefully shows the inactive currency label instead of crashing. (See [currencies.md § 11.7](currencies.md))
