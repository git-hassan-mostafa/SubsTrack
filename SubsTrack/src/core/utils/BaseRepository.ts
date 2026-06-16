import { supabase } from "@/src/shared/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import i18n from "@/src/core/i18n";
import { BRANCH_FILTER_UNASSIGNED, BranchFilter } from "../constants";
import { readFunctionsErrorBody } from "./functionsError";

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
  | { kind: "owned"; column?: string }
  | { kind: "shared"; column?: string }
  | { kind: "inherited"; joinedTable: string; column?: string };

export abstract class BaseRepository {
  protected readonly db: SupabaseClient = supabase;

  protected handleError(error: unknown): never {
    if (error && typeof error === "object" && "message" in error) {
      console.error("[Repository Error]", error.message);
      throw new Error((error as { message: string }).message);
    }
    console.error("[Repository Error]", error);
    throw new Error(i18n.t("errors.unexpected"));
  }

  /**
   * Edge-function counterpart to handleError. supabase-js hides the real error
   * behind a generic "non-2xx status code" message; the function's own message
   * lives in the JSON body on error.context.response. Surface that when present,
   * otherwise fall back to the generic handling.
   */
  protected async handleFunctionsError(error: unknown): Promise<never> {
    const body = await readFunctionsErrorBody(error);
    if (body?.error) {
      console.error("[Edge Function Error]", body.error);
      throw new Error(body.error);
    }
    this.handleError(error);
  }

  /**
 * The single source of truth for "how does each table relate to a branch?"
 * Adding a new branch-aware table means adding one line here.
 */
  protected BRANCH_SCOPES = {
    customers: { kind: "owned" },
    users: { kind: "owned" },
    plans: { kind: "shared" },
    payments: { kind: "inherited", joinedTable: "customers" },
    products: { kind: "shared" },
    sales: { kind: "owned" },
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
  protected applyBranchFilter<T extends Record<string, any>>(
    query: T,
    filter: BranchFilter,
    scope: BranchScope,
  ): T {
    if (filter === null) return query;

    const column = scope.column ?? "branch_id";
    const path =
      scope.kind === "inherited" ? `${scope.joinedTable}.${column}` : column;

    if (filter === BRANCH_FILTER_UNASSIGNED) {
      return query.is(path, null);
    }
    if (scope.kind === "shared") {
      // Include shared rows (branch_id IS NULL) alongside this branch's rows.
      return query.or(`${column}.is.null,${column}.eq.${filter}`);
    }
    return query.eq(path, filter);
  }
}
