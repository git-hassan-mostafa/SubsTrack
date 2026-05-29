# Branches / Zone Management — QA Scenarios

Multi-location support. A tenant with zero or one branches behaves as a single-location tenant — the BranchSelector and most pickers self-conceal. The feature only "turns on" UI-wise once a tenant has ≥2 active branches.

New tenants created via SuperAdmin auto-get a `"Default Branch"` so the tenant is never in a 0-branch state.

**Reference code:**
- Branches module: [src/modules/branches/](SubsTrack/src/modules/branches/)
  - Screen: [BranchesScreen.tsx](SubsTrack/src/modules/branches/screens/BranchesScreen.tsx)
  - Card: [BranchCard.tsx](SubsTrack/src/modules/branches/components/BranchCard.tsx)
  - Form sheet: [BranchFormSheet.tsx](SubsTrack/src/modules/branches/components/BranchFormSheet.tsx)
  - Service: [BranchService.ts](SubsTrack/src/modules/branches/services/BranchService.ts)
  - Store: [branchStore.ts](SubsTrack/src/modules/branches/store/branchStore.ts)
- RLS helper: `public.current_branch_id()` in [script.sql](sql%20scripts/script.sql)
- Branch-aware policies on `users`, `customers`, `plans`, `payments`
- BranchSelector chip: [BranchSelector.tsx](SubsTrack/src/shared/components/BranchSelector.tsx)
- BranchPicker (form picker): [BranchPicker.tsx](SubsTrack/src/shared/components/BranchPicker.tsx)
- Filter helpers: [branchFilter.ts](SubsTrack/src/shared/lib/branchFilter.ts)
- Edge function branch validation: [supabase/functions/create-user/index.ts](SubsTrack/supabase/functions/create-user/index.ts)
- SuperAdmin tenant creation: [SuperAdmin TenantService](SuperAdmin/src/modules/tenants/services/TenantService.ts)

**Glossary:**
- **Tenant-wide admin** = admin with `users.branch_id IS NULL`. Sees every branch + unassigned records.
- **Branch admin** = admin with `users.branch_id = X`. Only manages branch X.
- **Branch staff** = `role = 'user'` with `users.branch_id = X`.

---

## 0. Critical invariants

1. **`useIsMultiBranchActive()` returns true only when tenant has ≥2 active branches.** Used to gate BranchSelector and BranchPicker visibility globally.
2. **Branch is mandatory** for customers, plans, and staff users once any branch exists (`tenantHasBranches = true`). Tenant-wide admins (role=admin + branch_id NULL) are the only exception.
3. **NULL semantics differ per table:**
   - `users.branch_id IS NULL` = tenant-wide admin (intentional).
   - `customers.branch_id IS NULL` = UNASSIGNED, legacy state only (only reachable today by branch deletion).
   - `plans.branch_id IS NULL` = SHARED across all branches.
   - `payments` has no branch_id — inherits via JOIN to customer.
4. **Branch filtering is UI-state-only.** `uiPrefStore.currentBranchId` (AsyncStorage). RLS already constrains branch-scoped users; tenant-wide admins get the chip.
5. **New tenants auto-get "Default Branch".** SuperAdmin's `TenantService.createTenant` inserts it before the admin auth user.
6. **Soft-delete preserves references.** Deleting a branch with assigned customers/users/plans sets `active = false`. Records keep their branch_id pointing at the inactive branch.

---

## 1. Backward compatibility (zero branches — legacy tenants only)

Note: any tenant created since the Default Branch change will never be in this state.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | No branches exist (legacy) | Login as admin in a 0-branch tenant | No BranchSelector chip. No BranchPicker in forms. All previous behavior unchanged |
| 1.2 | Customer list | Open customers | All customers visible (all have `branch_id IS NULL`) |
| 1.3 | Create customer (no branch picker) | Open form, fill, save | No Branch field. Saved with `branch_id IS NULL` |
| 1.4 | Create user (role=user, no branch picker) | Open Users → +Add → role=user | No Branch field. Save succeeds |
| 1.5 | Create plan (no branch picker) | Open Plans → +Add | No Branch field. Saved with `branch_id IS NULL` (effectively Shared) |
| 1.6 | First branch created on legacy tenant | Admin creates "Beirut" | Tenant moves to 1-branch state (see § 2). Existing customers/users/plans still NULL — visible to tenant-wide admin, hidden from branch-scoped users until reassigned |

## 2. Single-branch tenants (1 active branch)

This is the steady state for most small businesses. BranchSelector and BranchPicker hide globally.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | New tenant has Default Branch | Create tenant via SuperAdmin | Tenant has exactly 1 active branch named "Default Branch" |
| 2.2 | BranchSelector hidden | Login as the tenant's admin | No chip below PageHeader |
| 2.3 | BranchPicker hidden in CustomerFormSheet | Open Add Customer | No Branch field. Auto-bound to the only branch |
| 2.4 | BranchPicker hidden in PlanFormSheet | Open Add Plan | No Branch field. Auto-bound to the only branch |
| 2.5 | BranchPicker hidden in UserFormSheet (role=user) | Open Add Staff, role=user | No Branch field. Auto-bound to the only branch |
| 2.6 | UserFormSheet — role=admin | role=admin | branch_id may stay null (tenant-wide admin) — verify default behavior |
| 2.7 | Role flip clears branch | Switch role admin → user → admin in the form | `branchId` toggles between null and the auto-bound branch |
| 2.8 | Auto-bind only on create | Open Edit | Existing branch_id is preserved; no auto-rebind |
| 2.9 | Branches admin CRUD reachable | Admin → Branches | List shows the Default Branch. Admin can rename or add more |
| 2.10 | Adding a 2nd branch | Admin creates "Tripoli" | Tenant transitions to multi-branch state. BranchSelector becomes visible. Forms gain a branch picker |

## 3. Multi-branch tenants (≥2 active branches)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | BranchSelector chip — tenant-wide admin | branch_id NULL, ≥2 active branches | Chip rendered below PageHeader on Customers/Dashboard/Plans/Users |
| 3.2 | BranchSelector chip — branch-scoped admin | branch_id = Beirut | Chip NOT rendered |
| 3.3 | BranchSelector chip — branch-scoped staff | role=user, branch_id = Beirut | Chip NOT rendered |
| 3.4 | Selection persists | Pick Tripoli → kill app → relaunch | Selection still "Tripoli" |
| 3.5 | All Branches view | Pick "All Branches" | Lists show ALL records across branches + unassigned |
| 3.6 | Specific branch view | Pick "Beirut" | Lists show ONLY Beirut records (no Tripoli, no unassigned) |
| 3.7 | Unassigned filter | Pick "Unassigned" | Lists show ONLY records with `branch_id IS NULL` (legacy / orphaned) |
| 3.8 | Live refetch on switch | Customers loaded → switch chip | List re-fetches; tab counts update; "active" tab respects new scope |
| 3.9 | Dashboard respects scope | Pick Beirut on Dashboard | All 6 metrics scoped to Beirut (plans include shared) |

## 4. Branches CRUD

Reached from Admin tab → Branches.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Create first additional branch | Tap +Add → "Beirut" → Save | Branch appears in list. Tenant transitions to multi-branch state (see § 3) |
| 4.2 | Create another | "+Add → Tripoli" | Listed |
| 4.3 | Required field marked | Branch Name has "*" |
| 4.4 | Duplicate branch name | Try a duplicate | "A branch with this name already exists" (per-tenant unique) |
| 4.5 | Rename branch | Edit "Beirut" → "Beirut Central" → Save | New name reflected everywhere |
| 4.6 | Trim name | "  Beirut  " | Stored as "Beirut" |
| 4.7 | Hard delete (unreferenced) | Create "TempBranch", no records, Delete | Row removed |
| 4.8 | Soft delete (referenced) | Assign records to Beirut, then Delete | `active = false`. Records keep their branch_id |
| 4.9 | Reactivate | Edit inactive branch → Reactivate | Active again |
| 4.10 | List order | Active branches first, then inactive |
| 4.11 | Action menu on card | ⋮ or long-press | Edit + Delete (or Reactivate) items |
| 4.12 | Last active branch | Tenant has exactly 1 active branch, admin tries to delete it | Verify: either allowed (transitions back to 0-branch state) or blocked. Document expected behavior |
| 4.13 | Default Branch deletion | New tenant has only "Default Branch", admin deletes it | Same as 4.12 |

## 5. Visibility / RLS — strict isolation

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Branch admin sees only own branch | Beirut admin views customers | Only Beirut customers. Tripoli + unassigned hidden |
| 5.2 | Branch staff cannot see other branch staff | Beirut admin opens Users | Only Beirut users + self. No Tripoli users, no tenant-wide admins |
| 5.3 | Branch admin sees shared + own plans | Mix: shared, Beirut, Tripoli plans | Beirut admin sees shared + Beirut. NOT Tripoli |
| 5.4 | Branch admin sees payments only for own branch customers | Beirut admin opens customer year grid | Tripoli customers invisible → their payments invisible |
| 5.5 | Unassigned customer hidden | Tenant-wide admin creates customer with no branch | Beirut admin does NOT see it |
| 5.6 | RLS attack — direct UUID | Take Tripoli customer's UUID, fetch from Beirut session | Empty (RLS denies) |
| 5.7 | RLS attack — direct SELECT | `select * from customers where branch_id = '<other-branch>'` from branch-scoped session | Zero rows |
| 5.8 | Tenant-wide admin sees everything | Login as tenant-wide admin | All branches + unassigned visible |

## 6. Form behavior — mandatory branch enforcement

Once tenant has any branch (`tenantHasBranches = true`), every form re-checks this.

### CustomerFormSheet

| # | Scenario | User context | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Branch picker — scoped admin | Beirut admin | NO picker. Auto-bound to Beirut |
| 6.2 | Branch picker — tenant-wide admin (multi-branch) | Tenant-wide admin | Picker shown, `nullable=false`. Defaults to currently-selected branch in BranchSelector (or null if All/Unassigned) |
| 6.3 | Branch picker — single-branch tenant | Tenant-wide admin in 1-branch tenant | Picker hidden. Auto-bound |
| 6.4 | Submit disabled when branch unset | Tenant-wide admin, multi-branch, leaves blank | Submit disabled with hint |
| 6.5 | Service re-validates | Bypass UI | `CustomerService.validateInput` rejects |
| 6.6 | Plan dropdown filtering | Branch = Beirut selected | Dropdown shows shared + Beirut plans only |
| 6.7 | Change branch clears mismatched plan | Pick Tripoli plan → switch to Beirut | Plan field cleared |
| 6.8 | Edit existing customer | Tenant-wide admin edits Beirut customer | Picker defaults to "Beirut"; reassignable |

### PlanFormSheet

| # | Scenario | User context | Expected result |
|---|----------|-------|-----------------|
| 6.9 | Branch picker — scoped admin | Beirut admin | NO picker. Plan auto-saved with `branch_id = Beirut` |
| 6.10 | Branch picker — tenant-wide admin (multi-branch) | Tenant-wide admin | Picker shown with "Shared (all branches)" + each active branch. Picker is `nullable=false` for branch-specific plans; "Shared" option produces null. Verify exact wording |
| 6.11 | Duplicate name across branches | Same name in Beirut + Tripoli + Shared | All three coexist (NULLs unequal in unique index) |
| 6.12 | Duplicate name in same branch | Two "Basic" in Beirut | "A plan with this name already exists" |

### UserFormSheet

| # | Scenario | User context | Expected result |
|---|----------|-------|-----------------|
| 6.13 | Branch picker — scoped admin | Beirut admin | NO picker. New user gets `branch_id = Beirut` |
| 6.14 | Branch picker — tenant-wide admin | Tenant-wide admin | Dropdown with per-branch options + "Tenant-wide" (only for role=admin) |
| 6.15 | Staff requires branch (multi-branch tenant) | role=user, branch unset | Submit disabled with hint "Staff users must be assigned to a branch" |
| 6.16 | Admin can stay tenant-wide | role=admin, branch unset | Save succeeds. New admin is tenant-wide |
| 6.17 | Edge function — cross-branch attack | Beirut admin POSTs `branchId = Tripoli` | Edge function ignores supplied branchId, forces caller's own branch |
| 6.18 | Edge function — invalid branchId | Tenant-wide admin passes branchId from another tenant | Returns "Invalid branch for this tenant" |

## 7. Migration / mixed-mode

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | Fresh schema apply | Run `reset.sql` then `script.sql` | `branches` table created; `branch_id` columns present on users/customers/plans; uniqueness index `uq_plans_name_tenant_branch` in place |
| 7.2 | Existing data on first deploy | Pre-existing tenants | All rows have `branch_id = NULL`. Tenant-wide admins still see everything |
| 7.3 | Create first branch on populated tenant | Tenant-wide admin creates Beirut | Existing customers/users/plans still NULL = unassigned/shared respectively |
| 7.4 | Bulk-assign existing customers | Admin opens customers one by one and assigns to Beirut | After each save, customer moves between scopes |
| 7.5 | SuperAdmin creates new tenant | Tenant + Default Branch + admin user created atomically | Tenant ends up in 1-branch state. If admin user creation fails, tenant + branch rollback |

## 8. Edge cases

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 8.1 | Soft-delete branch with staff inside | Beirut has 2 staff → delete Beirut | Soft-delete. Staff users still exist with branch_id pointing at inactive branch |
| 8.2 | Reactivate after soft-delete | Edit inactive Beirut → Reactivate | Active again. Everything resumes |
| 8.3 | Hard-delete via DB | FK `ON DELETE SET NULL` on users/customers/plans | Records' branch_id becomes null (unassigned/shared). The "Unassigned" filter surfaces these |
| 8.4 | RLS on language reload | Tenant-wide admin switches to Arabic → app reloads | After reload, BranchSelector still shows current selection in RTL |
| 8.5 | uiPrefStore corruption / first run | Wipe AsyncStorage, login as tenant-wide admin | `currentBranchId` defaults to null (All Branches). No crashes |
| 8.6 | uiPrefStore points at deleted branch | Selection was Beirut; admin hard-deletes Beirut | Verify fallback: should reset to null without crashing |
| 8.7 | Branch name with special chars | "Beirut 🇱🇧" | Saved, displayed |
| 8.8 | Branch name with leading/trailing space | "  Beirut  " | Trimmed |
| 8.9 | Tenant in 0-branch state legacy | Verify behavior matches § 1 |
| 8.10 | Concurrent branch creation | Two admins create same name | Second fails uniqueness check |
| 8.11 | BranchSelector after switching tenants | Logout from multi-branch tenant A, login as single-branch tenant B | Chip self-conceals on tenant B |
