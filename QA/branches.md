# Branches / Zone Management — QA Scenarios

Multi-location support. A tenant with zero branches behaves exactly as before — the feature stays invisible.

**Reference code:**
- Branches module: [src/modules/branches/](SubsTrack/src/modules/branches/)
- RLS helper: `public.current_branch_id()` in [script.sql](sql%20scripts/script.sql)
- Branch-aware policies on `users`, `customers`, `plans`, `payments`
- BranchSelector: [src/shared/components/BranchSelector.tsx](SubsTrack/src/shared/components/BranchSelector.tsx)
- Filter helpers: [src/shared/lib/branchFilter.ts](SubsTrack/src/shared/lib/branchFilter.ts)
- Edge function branch validation: [supabase/functions/create-user/index.ts](SubsTrack/supabase/functions/create-user/index.ts)

**Glossary for scenarios:**
- **Tenant-wide admin** = admin with `users.branch_id IS NULL`. Sees every branch + unassigned records.
- **Branch admin** = admin with `users.branch_id = X`. Only manages branch X.
- **Branch staff** = `role = 'user'` with `users.branch_id = X`.

---

## 1. Backward compatibility (zero branches)

| #   | Scenario                            | Steps                                                                  | Expected result                                                       |
| --- | ----------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1.1 | No branches exist                   | Login as admin in a tenant with 0 branches                             | No BranchSelector chip in the header. All previous behavior unchanged |
| 1.2 | Customer list                       | Open customers                                                         | All customers visible (all have `branch_id IS NULL`)                  |
| 1.3 | Create customer                     | Open form, fill, save                                                  | No Branch field in the form. Saved with `branch_id IS NULL`           |
| 1.4 | Create user (role=user)             | Open Users → +Add → role=user                                          | No Branch field. Save succeeds                                        |
| 1.5 | Create plan                         | Open Plans → +Add                                                      | No Branch field. Saved with `branch_id IS NULL` (= shared)            |
| 1.6 | Existing data after schema migration | Run new `script.sql` on existing tenant                                | All rows still visible to the existing admin; no behavior change      |

## 2. Branches CRUD

| #   | Scenario                              | Steps                                                                            | Expected result                                                                                        |
| --- | ------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 2.1 | Create first branch                   | Settings → Branches → +Add → name "Beirut" → Save                                | Branch appears in list. Header BranchSelector becomes visible to tenant-wide admin                     |
| 2.2 | Create second branch                  | Add "Tripoli"                                                                    | Both branches in list                                                                                  |
| 2.3 | Duplicate branch name                 | Add another "Beirut"                                                             | Error: "A branch with this name already exists"                                                        |
| 2.4 | Rename branch                         | Edit "Beirut" → "Beirut Central" → Save                                          | New name reflected everywhere it's referenced                                                          |
| 2.5 | Delete unreferenced branch            | Create "TempBranch" without assigning any records → Delete                       | Hard-delete: row gone, BranchCard removed                                                              |
| 2.6 | Delete referenced branch              | Assign at least one customer/user/plan to "Beirut" → Delete                      | Soft-delete: branch marked inactive (`active = false`), records keep their `branch_id`                 |
| 2.7 | Reactivate inactive branch            | Edit the inactive "Beirut" → Reactivate                                          | Becomes active again, references unchanged                                                             |
| 2.8 | Branch list ordering                  | Mix of active + inactive branches                                                | Active branches listed first, then inactive                                                            |

## 3. Header BranchSelector

| #   | Scenario                                | User context                              | Expected result                                                                                            |
| --- | --------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 3.1 | Chip visibility — tenant-wide admin     | branch_id NULL, ≥1 active branch          | Chip rendered below PageHeader on Customers/Dashboard/Plans/Users                                          |
| 3.2 | Chip visibility — branch-scoped admin   | branch_id = Beirut                        | Chip NOT rendered (their branch is fixed)                                                                  |
| 3.3 | Chip visibility — zero branches         | branch_id NULL, 0 active branches         | Chip NOT rendered                                                                                          |
| 3.4 | Selection persists                      | Pick Tripoli → kill app → relaunch        | Selection still "Tripoli" after restart                                                                    |
| 3.5 | All Branches view                       | Pick "All Branches"                       | Customer list shows ALL customers across branches + unassigned                                             |
| 3.6 | Specific branch                         | Pick "Beirut"                             | Customer list shows ONLY Beirut customers (no Tripoli, no unassigned)                                      |
| 3.7 | Unassigned filter                       | Pick "Unassigned"                         | Customer list shows ONLY customers with `branch_id IS NULL`                                                |
| 3.8 | Live refetch on switch                  | Customers loaded → switch chip            | List re-fetches; counts update; "active" tab respects new scope                                            |
| 3.9 | Dashboard respects scope                | Pick Beirut on Dashboard                  | All 6 metrics scoped to Beirut customers / payments / users / plans (plans include shared)                 |

## 4. Visibility / RLS — strict isolation

| #   | Scenario                                       | Steps                                                                                       | Expected result                                                                                                 |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 4.1 | Branch admin sees only own branch              | Create Beirut admin. Tenant-wide admin creates customers in Beirut, Tripoli, unassigned     | Beirut admin sees only Beirut customers. Tripoli + unassigned hidden                                            |
| 4.2 | Branch staff cannot see other branch staff    | Beirut admin opens Users                                                                    | Only Beirut users + self visible. No Tripoli users, no other tenant-wide admins                                  |
| 4.3 | Branch admin sees own + shared plans           | Mix: shared plan, Beirut plan, Tripoli plan                                                 | Beirut admin sees shared + Beirut plans. Does NOT see Tripoli plans                                              |
| 4.4 | Branch admin sees payments only for own branch | Beirut admin opens customer year grid                                                       | Payments for Tripoli customers invisible (their customer is invisible to start)                                  |
| 4.5 | Unassigned customer hidden                     | Tenant-wide admin creates customer with no branch. Beirut admin logs in                     | Beirut admin does NOT see the unassigned customer                                                                |
| 4.6 | RLS attack — direct UUID                       | Take a Tripoli customer's UUID, attempt fetch from Beirut admin session                     | Empty result (RLS denies). UI shows "not found" or empty state                                                   |
| 4.7 | RLS attack — direct SELECT with WHERE          | From a branch-scoped session: `select * from customers where branch_id = '<other-branch>'`  | Zero rows (RLS strips them silently)                                                                             |

## 5. Form behavior

### CustomerFormSheet

| #   | Scenario                            | User context                | Expected result                                                                                              |
| --- | ----------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 5.1 | Branch field visibility — scoped    | Beirut admin opens form     | NO Branch dropdown. On save, `branch_id = Beirut` auto-injected                                              |
| 5.2 | Branch field visibility — tenant-wide | Tenant-wide admin           | Branch dropdown shown. Defaults to currently-selected branch in header (or "Unassigned" if All/Unassigned)   |
| 5.3 | Plan dropdown filtering             | Form open with branch=Beirut| Plan dropdown shows: shared plans + Beirut plans. No Tripoli plans                                           |
| 5.4 | Change branch clears mismatched plan| Pick Tripoli plan → switch to Beirut | Plan field cleared (because Tripoli plan doesn't match Beirut)                                              |
| 5.5 | Edit existing customer              | Tenant-wide admin edits a Beirut customer | Branch dropdown defaults to "Beirut"; can be reassigned                                                  |

### PlanFormSheet

| #   | Scenario                                  | User context              | Expected result                                                                                  |
| --- | ----------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| 5.6 | Branch field visibility — scoped admin    | Beirut admin              | NO Branch dropdown. Plan auto-saved with `branch_id = Beirut`                                    |
| 5.7 | Branch field — tenant-wide admin          | Tenant-wide admin         | Branch dropdown. "Shared (all branches)" option available (= null). Defaults to Shared          |
| 5.8 | Duplicate name across branches            | Same name in Beirut + Tripoli + Shared | All three coexist (NULLs unequal in unique index)                                              |
| 5.9 | Duplicate name in same branch             | Two "Basic" in Beirut     | Error: "A plan with this name already exists"                                                    |

### UserFormSheet

| #    | Scenario                                  | User context                | Expected result                                                                                                       |
| ---- | ----------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 5.10 | Branch field — scoped admin               | Beirut admin                | NO Branch dropdown. New user gets `branch_id = Beirut`                                                                |
| 5.11 | Branch field — tenant-wide admin          | Tenant-wide admin           | Dropdown with Tenant-wide / each branch / Unassigned options                                                          |
| 5.12 | Staff requires branch                     | Once ≥1 branch exists, role=user, branch unset | Submit disabled with "Staff users must be assigned to a branch" hint                                  |
| 5.13 | Admin can stay tenant-wide                | role=admin, branch unset    | Save succeeds. New admin is tenant-wide                                                                               |
| 5.14 | Edge function — cross-branch attack       | Beirut admin calls create-user with `branchId = Tripoli-uuid` | Edge function ignores the supplied branchId and forces caller's own branch (Beirut)                  |
| 5.15 | Edge function — invalid branchId          | Tenant-wide admin passes a branchId from another tenant      | Edge function returns "Invalid branch for this tenant"                                              |

## 6. Migration / mixed-mode

| #   | Scenario                                       | Steps                                                                              | Expected result                                                              |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 6.1 | Fresh schema apply                              | Run `reset.sql` then `script.sql` against a project                                | `branches` table created; `branch_id` present inline on `users`/`customers`/`plans`; `uq_plans_name_tenant_branch` index in place |
| 6.2 | Existing data on first deploy                  | All pre-existing customers / users / plans have `branch_id = NULL`                 | Visible to tenant-wide admins (default state). Branch-scoped users see none until reassigned |
| 6.3 | Create first branch on a populated tenant      | Tenant-wide admin creates Beirut. Branch-scoped users not yet created              | Existing customers still NULL = unassigned. Tenant-wide admin still sees them                  |
| 6.4 | Bulk-assign existing customers                 | Tenant-wide admin opens customers one-by-one and assigns to Beirut                 | After each save, the customer disappears from "Unassigned" view and appears in "Beirut"        |

## 7. Edge cases

| #   | Scenario                                | Steps                                                                          | Expected result                                                                       |
| --- | --------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 7.1 | Soft-delete a branch with staff inside  | Beirut has 2 staff users → tenant-wide admin deletes Beirut                    | Soft-delete. Staff users still exist with `branch_id` pointing at inactive branch     |
| 7.2 | Reactivate after soft-delete            | Reactivate the soft-deleted branch                                             | Becomes active. Everything resumes normally                                            |
| 7.3 | Delete a branch with shared plan         | Tenant-wide admin creates "Basic" shared, then tries to delete a branch         | Shared plan unrelated; deletion proceeds based on referenced records                  |
| 7.4 | RLS on language reload                  | Tenant-wide admin switches to Arabic → app reloads                              | After reload, BranchSelector still shows "كل الفروع" (or selected branch) in RTL       |
| 7.5 | uiPrefStore corruption / first run      | Wipe AsyncStorage, login as tenant-wide admin                                  | `currentBranchId` defaults to `null` (All Branches). No crashes                       |
