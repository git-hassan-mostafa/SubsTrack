# Tenant Settings — QA Scenarios

The admin-only "Tenant Settings" hub is reachable from the Admin tab. It collects tenant-level configuration: **Display Currency** preference (per-user UI pref), **Currencies CRUD** (tenant-wide), and **Branches CRUD** (tenant-wide). Each of those has its own deep file referenced below; this file covers navigation, layout, gating, and the per-user display-currency selector.

**Reference code:**
- Screen: [TenantSettingsScreen.tsx](SubsTrack/src/modules/tenant-settings/screens/TenantSettingsScreen.tsx)
- Display currency section: [DisplayCurrencySection.tsx](SubsTrack/src/modules/tenant-settings/components/DisplayCurrencySection.tsx)
- UI prefs store: [uiPrefStore.ts](SubsTrack/src/shared/lib/uiPrefStore.ts)
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

The currency the user wants to SEE values in. Stored in `uiPrefStore.displayCurrencyId` (AsyncStorage, per-user).

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Section title | Look at section | "Display Currency" header + helper text explaining it's a personal preference |
| 2.2 | Available choices | Open dropdown / list | USD + every active tenant currency |
| 2.3 | Default value | First install | USD (null) |
| 2.4 | Change to LBP | Pick LBP from the list | Persisted immediately. No restart required |
| 2.5 | Persistence across restarts | Restart app | Still LBP |
| 2.6 | Persistence across logout | Logout, log back in as same user | Still LBP (it's a UI pref, not session-bound) |
| 2.7 | Effect on Plan cards | Open Plans screen | USD plans show "$X" + "≈ LBP equivalent (via live rate)" |
| 2.8 | Effect on Dashboard | Open Dashboard | "Collected" hero formatted in LBP |
| 2.9 | Effect on PaymentDetailSheet | Open a receipt | Primary line = stored currency; secondary line = LBP equivalent (via snapshot) |
| 2.10 | Effect on Customer year totals | Open customer detail | "X collected" total formatted in LBP |
| 2.11 | Inactive currency selected | Display currency was X, then admin soft-deletes X | UI falls back to USD without crashing |
| 2.12 | Empty tenant currencies | Tenant has zero `currencies` | Dropdown shows USD only |
| 2.13 | RTL display | Switch app to Arabic | Section layout mirrors RTL |

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

## 5. Workspace / app prefs (from existing Settings tab)

The existing user-level Settings tab is documented separately in [settings.md](settings.md). It covers:
- Profile card
- Language switcher (with restart)
- Logout

The tenant-level configuration here is a separate concept managed by admins. Keep the two surfaces distinct in QA — a regression in either should not be reported against the other.

## 6. Edge cases

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Two admins change tenant settings concurrently | Admin A and B both pick a different display currency | Each admin keeps their own (AsyncStorage is per-device) |
| 6.2 | Concurrent edits to currencies/branches | Admin A creates LBP, Admin B creates LBP | Second create fails with duplicate-code error |
| 6.3 | Tenant Settings while offline | Disable network, open the screen | Display currency picker works offline (local-only). Currencies/Branches sub-screens show network error on refresh |
| 6.4 | Deep link without auth | Force-navigate to `/(app)/(tabs)/admin/tenant-settings` while logged out | Redirected to login (AppLayout guard) |
