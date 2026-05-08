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
| Customers | [customers.md](customers.md) | List, search, filter, create, edit, deactivate/reactivate, detail |
| Payments | [payments.md](payments.md) | Record (Scenarios A/B/C), edit, void, receipt sheet, grace period |
| Monthly Grid | [monthly-grid.md](monthly-grid.md) | Cell statuses, year navigation, date/timezone correctness |
| Plans | [plans.md](plans.md) | List, create, edit, delete, fixed vs custom pricing |
| Users (Staff) | [users.md](users.md) | List, create, edit, role assignment, password rules |
| Dashboard | [dashboard.md](dashboard.md) | Hero card, stat cards, admin compact stats, refresh |
| Settings | [settings.md](settings.md) | Profile, language switcher with restart, logout |
| Admin & Navigation | [admin-and-navigation.md](admin-and-navigation.md) | Tab visibility, role gating, routing, deep links |
| Multi-tenancy | [multi-tenancy.md](multi-tenancy.md) | Tenant isolation reads/writes, tenant inactive, workspace code |
| Non-functional | [non-functional.md](non-functional.md) | Performance, accessibility, i18n/RTL, security, resilience |

## Pre-release checklist (high level)

- [ ] All scenarios in [authentication.md](authentication.md) pass.
- [ ] All scenarios in [multi-tenancy.md](multi-tenancy.md) pass — **release blocker.**
- [ ] [Customers](customers.md), [Payments](payments.md), [Monthly Grid](monthly-grid.md) pass for both `admin` and `user` roles.
- [ ] [Plans](plans.md), [Users](users.md), [Dashboard](dashboard.md) pass for `admin` (and confirm hidden for `user`).
- [ ] [Settings](settings.md) passes including language restart on iOS, Android, and Expo Go.
- [ ] [Non-functional](non-functional.md) sections 1 (performance), 2 (errors), 5 (i18n/RTL), 7 (security), 8 (data integrity) pass.
- [ ] All identified findings ("verify…", "file a finding…" notes) reviewed and either fixed or signed off as known limitations.

## Test data needed

- At least 2 tenants, both active.
- 1 deactivated tenant for tenant-inactive scenarios.
- 3 users per tenant: 1 admin, 1 user, 1 superadmin (test fixture).
- 5 plans per tenant: 2 fixed-price, 2 custom-price, 1 with $0.01 boundary.
- 30+ customers in tenant A (to test pagination), mix of active and inactive, mix of plan assignments.
- Customers with start_dates spanning past, current and future to exercise the monthly grid.
- Existing payments per customer covering: paid, voided, multi-year history.

## Reporting findings

When a scenario fails, capture:
- Scenario id (e.g. `payments.md § 5.3`).
- Steps to reproduce.
- Expected vs actual.
- Device, OS version, app build, tenant id, user id.
- Screenshot or screen recording if UI-related.
- Network HAR or Supabase logs if backend-related.

## Open items / verifications

These were called out inside the scenario files and should be resolved before release:

- **Payment void permission gating** — confirm whether the `user` role can void payments via UI or API. (See [payments.md § 8.12](payments.md))
- **Customer deactivation gating** — confirm whether the `user` role can tap the status row on detail screen. (See [customers.md § 11](customers.md))
- **Edit Amount permission** — confirm whether the `user` role can edit a custom payment's amount. (See [payments.md § 12](payments.md))
- **"New This Month" label** on Dashboard — value displayed is `totalCustomers`, not a true monthly count. Reconcile label with intent. (See [dashboard.md § 3.2](dashboard.md))
- **Hardcoded English strings** in several screens (e.g. "Welcome back", "Inactive", "Edit", "Address", subtitles in admin home and settings). (See [admin-and-navigation.md § 8.2](admin-and-navigation.md))
- **Currency / Date locale** uses `en-US` regardless of selected language. (See [non-functional.md § 5.4–5.5](non-functional.md))
- **Accessibility labels** on month cells and avatars not explicitly set. (See [monthly-grid.md § 8.4](monthly-grid.md))
- **Tenant_code migration** must be applied to Supabase before user-creation flow works. (See [users.md § 6.11](users.md))
