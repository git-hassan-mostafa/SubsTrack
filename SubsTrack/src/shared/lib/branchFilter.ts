import type { AuthUser } from '@/src/core/types';
import { type BranchFilter, BRANCH_FILTER_UNASSIGNED } from '@/src/core/constants';
import { useAuthSlice } from '@/src/state/hooks/useAuthSlice';
import { useUiPrefStore } from './uiPrefStore';

// ──────────────────────────────────────────────────────────────────────
// Resolving the filter — what should we filter to?
// ──────────────────────────────────────────────────────────────────────

/**
 * Resolves the BranchFilter to apply to queries for the calling user.
 *
 *   Branch-scoped user (branchId !== null) — always returns their own branchId.
 *     The header selector is not rendered for them; RLS also enforces this.
 *
 *   Tenant-wide admin (branchId === null) — returns whatever they last picked
 *     in the header selector via uiPrefStore.currentBranchId. Can be:
 *       null                       → "All Branches" (no filter)
 *       BRANCH_FILTER_UNASSIGNED   → only unassigned records
 *       <UUID>                     → that specific branch
 *
 * Use from anywhere that needs to scope a query — stores, services, screens.
 */
export function resolveBranchFilter(user: AuthUser | null): BranchFilter {
  if (!user) return null;
  if (user.branchId !== null) return user.branchId;
  return useUiPrefStore.getState().currentBranchId;
}

/** Hook variant. Re-renders when either auth or uiPref changes. */
export function useEffectiveBranchFilter(): BranchFilter {
  const user = useAuthSlice((s) => s.user);
  const currentBranchId = useUiPrefStore((s) => s.currentBranchId);
  if (!user) return null;
  if (user.branchId !== null) return user.branchId;
  return currentBranchId;
}

// ──────────────────────────────────────────────────────────────────────
// Applying the filter — branch-scope semantics per table
// ──────────────────────────────────────────────────────────────────────

/**
 * Describes how a row in a given table relates to a branch. There are exactly
 * three semantics in this codebase; declare one per branch-aware table in
 * BRANCH_SCOPES below and pass it to `applyBranchFilter`.
 *
 *   'owned'     — row has its OWN branch_id column. NULL means UNASSIGNED
 *                 (visible only to tenant-wide admins).
 *                 Used by: customers, users, (future) expenses.
 *
 *   'shared'    — row has its own branch_id column. NULL means SHARED across
 *                 every branch (visible to all). When filtering to a specific
 *                 branch, shared rows are INCLUDED alongside that branch's rows.
 *                 Used by: plans.
 *
 *   'inherited' — row has no branch_id of its own; the branch is read from a
 *                 joined parent table. Always use `.select('..., parent!inner(branch_id)')`
 *                 in the query so PostgREST can apply the filter on the join.
 *                 Used by: payments (inherits from customers).
 */
export type BranchScope =
  | { kind: 'owned'; column?: string }
  | { kind: 'shared'; column?: string }
  | { kind: 'inherited'; joinedTable: string; column?: string };

/**
 * The single source of truth for "how does each table relate to a branch?"
 * Adding a new branch-aware table means adding one line here.
 */
export const BRANCH_SCOPES = {
  customers: { kind: 'owned' },
  users: { kind: 'owned' },
  plans: { kind: 'shared' },
  payments: { kind: 'inherited', joinedTable: 'customers' },
} satisfies Record<string, BranchScope>;

/**
 * Apply the active branch filter to a Supabase query builder.
 *
 *   null                             → no filter (RLS handles visibility)
 *   BRANCH_FILTER_UNASSIGNED         → <column> IS NULL
 *   <UUID>, scope 'owned'            → <column> = UUID
 *   <UUID>, scope 'shared'           → <column> IS NULL OR <column> = UUID
 *   <UUID>, scope 'inherited'        → <joinedTable>.<column> = UUID
 *
 * Mutates and returns the builder so callers can chain.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyBranchFilter<T extends Record<string, any>>(
  query: T,
  filter: BranchFilter,
  scope: BranchScope,
): T {
  if (filter === null) return query;

  const column = scope.column ?? 'branch_id';
  const path = scope.kind === 'inherited' ? `${scope.joinedTable}.${column}` : column;

  if (filter === BRANCH_FILTER_UNASSIGNED) {
    return query.is(path, null);
  }
  if (scope.kind === 'shared') {
    // Include shared rows (branch_id IS NULL) alongside this branch's rows.
    return query.or(`${column}.is.null,${column}.eq.${filter}`);
  }
  return query.eq(path, filter);
}
