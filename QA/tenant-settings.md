# Tenant Settings — QA Scenarios

The admin-only "Tenant Settings" hub is reachable from the Admin tab. It collects tenant-level configuration: **Display Currency** (tenant-wide), **Currencies CRUD** (tenant-wide), and **Branches CRUD** (tenant-wide). Each of those has its own deep file referenced below; this file covers navigation, layout, gating, and the display-currency selector.

**Reference code:**
- Screen: [TenantSettingsScreen.tsx](SubsTrack/src/modules/admin/tenant-settings/screens/TenantSettingsScreen.tsx)
- Display currency section: [DisplayCurrencySection.tsx](SubsTrack/src/modules/admin/tenant-settings/components/DisplayCurrencySection.tsx)
- Setting read hook: [useTenantSettingSlice.ts](SubsTrack/src/state/hooks/useTenantSettingSlice.ts) (`useDisplayCurrencyId`)
- Tenant Settings tab route: `app/(app)/(tabs)/admin/tenant-settings.tsx`
- Currencies tab route: `app/(app)/(tabs)/admin/currencies.tsx` (deep dive: [currencies.md](currencies.md))
- Branches tab route: `app/(app)/(tabs)/admin/branches.tsx` (deep dive: [branches.md](branches.md))

---

## 1. Navigation & gating

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Reach Tenant Settings | Admin tab → Tenant Settings | Screen renders with PageHeader "Tenant Settings" + subtitle |
| 1.2 | Back button | Tap back | Returns to Admin landing |
| 1.3 | Visibility — admin | Login as admin | Reachable |
| 1.4 | Visibility — user role | Login as user | Admin tab hidden; screen unreachable from UI |
| 1.5 | Branch-scoped admin | Login as branch admin | Tenant-wide settings: verify access policy — file a finding if branch admins can mutate tenant-level data |
| 1.6 | Inactive tenant | Tenant deactivated | TenantInactiveScreen shown; settings never rendered |

## 2. Display currency section

The currency the whole ORGANIZATION sees values in. Stored in `tenant_settings` under key `DisplayCurrencyId` (the `currencies.id`; blank/unset = USD), written by admins only (RLS) and read by every member via `useDisplayCurrencyId()`. It is **not** a device preference — it used to live in `uiPrefStore`/AsyncStorage.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Section title | Look at section | "Display" header + helper text saying it applies to everyone in the organization |
| 2.2 | Available choices | Open dropdown / list | USD + every active tenant currency |
| 2.3 | Default value | Tenant that never set it | USD (no row, or empty value) |
| 2.4 | Change to LBP | Pick LBP from the list | Saved immediately, dropdown disabled while saving. No restart required |
| 2.5 | Persistence across restarts | Restart app | Still LBP (re-fetched from `tenant_settings` at login) |
| 2.6 | Persistence across logout | Logout, log back in as same user | Still LBP — the slice resets on logout and `primePostAuth` re-fetches it |
| 2.7 | Effect on Plan cards | Open Plans screen | USD plans show "$X" + "≈ LBP equivalent (via live rate)" |
| 2.8 | Effect on Dashboard | Open Dashboard | "Collected" hero formatted in LBP |
| 2.9 | Effect on PaymentDetailSheet | Open a receipt | Primary line = stored currency; secondary line = LBP equivalent (via snapshot) |
| 2.10 | Effect on Customer year totals | Open customer detail | "X collected" total formatted in LBP |
| 2.11 | Inactive currency selected | Display currency was X, then admin soft-deletes X | UI falls back to USD without crashing |
| 2.12 | Empty tenant currencies | Tenant has zero `currencies` | Dropdown shows USD only |
| 2.13 | RTL display | Switch app to Arabic | Section layout mirrors RTL |
| 2.14 | Applies to every user | Admin sets LBP; a `user`-role staff logs in on another device | Staff sees every amount in LBP without setting anything |
| 2.15 | Reaches other devices | Admin A sets LBP; Admin B is already logged in on another device | B picks it up on next sync/pull (native) or next login/refresh — not instantly mid-session |
| 2.16 | Non-admin cannot write | Force a write as a `user` role (RLS check) | Rejected by RLS; error surfaces in the ErrorBanner, value unchanged |
| 2.17 | Set offline (native) | Airplane mode → change to LBP | Saved to the local mirror, applied immediately, pushed on next sync |
| 2.18 | Back to USD | Pick the "USD" option | Value cleared to null; all screens format in USD |
| 2.19 | Audit entry | Change the value, open Admin → Audit Log | One `tenant_settings` update entry with the before/after value |

## 2b. Unpaid months rule (`UnpaidStartRule`)

Tenant-wide setting stored in the `tenant_settings` table (key `UnpaidStartRule`), written by admins only (RLS) and read by every member. It never affects paid / skipped / before-start months. It decides **two** things:

- **When the CURRENT month turns red.** `month_start` (default) — from day 1. `customer_start_day` — the current month stays grey **"Not due yet"** until that line's own start day-of-month arrives.
- **When the customer starts reading "Overdue".** Under `customer_start_day`, an unpaid **last month** is red on the grid and counts as owed (card shows the red "Unpaid" pill) but is **not late** until this month's start day arrives; on that day the card becomes "Overdue". **Anything older than last month is late immediately.** Past cells are never held back — only the badge waits.

**Reference code:** [UnpaidRuleSection.tsx](SubsTrack/src/modules/admin/tenant-settings/components/UnpaidRuleSection.tsx) · [TenantSettingService.ts](SubsTrack/src/modules/admin/tenant-settings/services/TenantSettingService.ts) · rule helpers `isNotDueYet` / `isNotLateYet` in [monthDueRules.ts](SubsTrack/src/modules/customer/customer-payments/utils/monthDueRules.ts) · grid in [PaymentService.ts](SubsTrack/src/modules/customer/customer-payments/services/PaymentService.ts)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2b.1 | Default when never set | Fresh tenant, open the section | "On the first day of the month" selected; behavior unchanged from before |
| 2b.2 | Switch to start-day rule | Pick "On the customer's start day" | Saved immediately; customer-list badges refresh without a manual reload |
| 2b.3 | Before the start day | Rule = start day, line starts on the 17th, today is the 3rd | Current month cell renders **grey "future"**, NOT red. Customer card shows the grey "Not due yet" badge |
| 2b.4 | On the start day | Same line, today is the 17th | Current month flips to red "unpaid"; card shows the red "Unpaid" badge |
| 2b.5 | After the start day | Same line, today is the 20th | Still red "unpaid" |
| 2b.6 | Pay early | Rule = start day, today is the 3rd, line starts the 17th | The current month is still **tappable and payable** — paying it turns the month green |
| 2b.7 | Past cells unaffected | Line started 4 months ago, nothing paid, today is before the start day | **All** past months are red — the rule never greys a past cell. Only the current month is grey, and only the "Overdue" badge waits (2b.29–2b.31) |
| 2b.8 | Backlog outranks the quiet reason | Rule = start day, an unpaid month **older than last month** exists, today is before the start day | Card shows a red "Overdue" pill (not "Not due yet" — owing money from further back outranks it). The customer is in the Overdue tab |
| 2b.9 | Unpaid tab filter | Rule = start day, customer's only line is not due yet, no past debt | Customer is **absent** from the Unpaid tab |
| 2b.10 | Skip outranks not-due-yet | Line is both skipped this month and before its start day | Card shows the slate "Skipped" badge, not "Not due yet" |
| 2b.10b | Paid this month, older month missed | Current month paid, a month older than last month unpaid | ONE red "Overdue" pill — never green "✓ Paid" beside it, because "paid" means "owes nothing" |
| 2b.10c | No duplicate red | Current month unpaid AND an older month unpaid | Only the red "Overdue" pill shows — the plain "Unpaid" pill is suppressed so the card never shows two red pills saying the same thing |
| 2b.11 | Short-month clamp | Line starts on the 31st, current month is February | Due day clamps to the last day of February — the month still becomes unpaid, never skipped entirely |
| 2b.12 | Start day = 1 | Line starts on the 1st | Both rules behave identically for that line |
| 2b.13 | Multi-plan, mixed due days | Lines start on the 5th and the 25th (both started months ago, every earlier month paid); today is the 10th and nothing is paid this month | Amber **"1/2 plans paid"** — the 5th line owes this month, the 25th owes nothing yet, and a line that owes nothing counts as paid |
| 2b.14 | Multi-plan all not due | Every line is before its start day, nothing owed from earlier months | Card shows "Not due yet"; quick pay still offered for those lines |
| 2b.15 | Switch back to month_start | Change the rule back | Every current month immediately reads red again where unpaid |
| 2b.16 | Non-admin cannot write | Login as `user` role | Admin tab hidden. A direct write is rejected by the `tenant_settings_write` RLS policy |
| 2b.17 | Tenant isolation | Tenant A sets start-day rule | Tenant B still on its own value (RLS scopes reads to `current_tenant_id()`) |
| 2b.18 | Offline change (native) | Go offline, change the rule, reconnect | Saved to the local mirror, flagged dirty, pushed on the next sync; converges on the `(tenant_id, key)` natural key |
| 2b.19 | Two devices change it offline | Both set a different value offline, then sync | Latest `updated_at` wins; both devices converge to one row (no duplicate-key stall) |
| 2b.20 | Logout isolation | Logout, login as a different tenant | The previous tenant's rule does not leak (slice is reset on logout) |
| 2b.21 | The reported case | Rule = start day, line starts **13/5/2026**, nothing paid, today is **4/8/2026** | Card shows ONE red **"Overdue"** pill — May/June are late whatever the billing day says. Opening the customer shows May/June/**July all red** and only August grey |
| 2b.22 | Badge must not change by itself | Same customer — open the list, wait, open a customer detail, come back | The pills are identical on the first paint and after returning. Nothing ever flips from grey to red on its own (both facts come from one query) |
| 2b.23 | No badge before data | Watch the list on a cold start | A card may briefly show **no** payment pill while the status loads; it must never show a red "Unpaid" that later turns grey. The flags row keeps its height so nothing jumps |
| 2b.24 | Skipped customer with old debt | Every line skipped this month, an earlier month unpaid | Card shows ONE red "Overdue" pill — no slate "Skipped": a skip excuses its own month, never a backlog |
| 2b.25 | Unpaid tab during first load | Rule = start day, open the Unpaid tab immediately on app start | Customers appear once their status lands. Nobody is listed or hidden on missing data |
| 2b.26 | Badges cleared on logout | Login as tenant A, view the customer list, logout, login as tenant B | Tenant B's list shows no leftover badges from tenant A |
| 2b.27 | Quick pay still offered | Rule = start day, customer's only line is not due yet and unpaid | "Pay now" is still offered for that line (pay early is allowed) and paying it turns the pill green |
| 2b.28 | Mixed due days, tally | Lines start the 1st (unpaid) and the 20th (not due yet); today is the 4th | Badge is red "Unpaid" for the due line only — the not-due-yet line is excluded from the N/M tally |
| 2b.29 | **Unpaid, not late yet** (the reported case) | Rule = start day, line starts the **15th** (months ago), everything paid except **last month**, today is the **11th** | Grid: last month **RED** (and counted in the "unpaid" chip), current month grey "THIS MONTH". Card: red **"Unpaid"** pill and **no** "Overdue" pill. The customer is in the Unpaid tab, absent from Overdue |
| 2b.30 | The badge flips on the billing day | Same customer, today is the **15th** | Card becomes ONE red **"Overdue"** pill (the plain "Unpaid" is suppressed). The current month also turns red. Nothing changed in the grid for last month — it was already red |
| 2b.31 | Two months back is late immediately | Rule = start day, line starts the 15th, the last **two** months unpaid, today is the 11th | Both are red; card reads **"Overdue"** — only *last* month gets the grace, never the one before it |
| 2b.32 | Last month is collectable | Tap last month's red cell before the 15th | The payment form opens and records normally; the cell turns green and the card goes back to "Not due yet" |
| 2b.33 | Pay order still holds | Last month unpaid (not late yet), tap the **current** month | Refused, naming last month as the one to collect first. Selecting both months together pays both |
| 2b.34 | Quick pay skips, never errors | Customer list, a line whose last month is unpaid, today is before the 15th | "Collect all due" / "Pay now" leaves that line alone with **no** error banner — collect from the customer's grid. (An "Unpaid" card with no quick pay offered is expected here) |
| 2b.35 | Skip beats everything | Last month is skipped on that line | Last month's cell is slate "Skipped" and never counts as owed or late |
| 2b.36 | Start day = 1, no waiting | Line starts on the 1st, last month unpaid, today is the 4th | Card reads **"Overdue"** — this month's billing day already passed |
| 2b.37 | month_start untouched | Same data as 2b.29 under `month_start` | Card reads "Overdue" from day 1 of the month; the grace exists only under `customer_start_day` |
| 2b.38 | Per-line grace in a multi-plan customer | Two lines, start days 5 and 25, both unpaid for last month, today is the 10th | The 5th line is late (day passed) → card reads "Overdue". The 25th line alone would not be |

## 3. Currencies management

Full coverage in [currencies.md](currencies.md). Key links from Tenant Settings:

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Reach Currencies | Tenant Settings → Currencies (or admin sub-menu) | Currencies screen renders |
| 3.2 | Tenant-wide effect | Changing a currency in tenant A | Visible to all users of tenant A; never to tenant B (RLS) |

## 4. Branches management

Full coverage in [branches.md](branches.md). Key links from Tenant Settings:

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Reach Branches | Tenant Settings → Branches (or admin sub-menu) | Branches screen renders |
| 4.2 | Single-branch UI hiding | Tenant has 0 or 1 branch | BranchSelector and other branch-aware UI hide globally |

## 5. Organization / app prefs (from existing Settings tab)

The existing user-level Settings tab is documented separately in [settings.md](settings.md). It covers:
- Profile card
- Language switcher (with restart)
- Logout

The tenant-level configuration here is a separate concept managed by admins. Keep the two surfaces distinct in QA — a regression in either should not be reported against the other.

## 6. Edge cases

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Two admins change tenant settings concurrently | Admin A and B both pick a different display currency | One tenant-wide value wins — the later `updated_at` (latest-write-wins on the `(tenant_id, key)` natural key). No duplicate rows |
| 6.2 | Concurrent edits to currencies/branches | Admin A creates LBP, Admin B creates LBP | Second create fails with duplicate-code error |
| 6.3 | Tenant Settings while offline | Disable network, open the screen | Display currency picker reads/writes the local mirror and pushes on next sync. Currencies/Branches sub-screens show network error on refresh |
| 6.4 | Deep link without auth | Force-navigate to `/(app)/(tabs)/admin/tenant-settings` while logged out | Redirected to login (AppLayout guard) |
