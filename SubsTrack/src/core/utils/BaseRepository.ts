import { supabase } from "@/src/shared/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import i18n from "@/src/core/i18n";
import { BRANCH_FILTER_UNASSIGNED, BranchFilter } from "../constants";
import { readFunctionsErrorBody } from "./functionsError";
import { logException } from "../errorLog/errorLogger";
import { buildAuditRow, type AuditInput } from "../audit";

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
      const message = (error as { message: string }).message;
      console.error("[Repository Error]", message);
      void logException({ source: "repository", message, context: this.constructor.name });
      throw new Error(message);
    }
    console.error("[Repository Error]", error);
    void logException({ source: "repository", message: String(error), context: this.constructor.name });
    throw new Error(i18n.t("errors.unexpected"));
  }

  /**
   * Append one entry to the audit trail. Call it right after a write, from the
   * method that already holds the row — see docs/features.md → Audit Trail.
   *
   * Never throws and never rejects: a failed audit insert must not fail the
   * user's save. A no-op edit (nothing actually changed) writes nothing.
   */
  protected async audit(input: AuditInput): Promise<void> {
    try {
      const row = buildAuditRow(input);
      if (!row) return;
      const { error } = await this.db.from("audit_logs").insert(row);
      if (error) throw new Error(error.message);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn("[audit] failed to record:", message);
      void logException({ source: "repository", message, context: `audit:${input.table}` });
    }
  }

  /**
   * The audit facts a child row inherits from its owning customer: the branch to
   * file the entry under (a payment / skip / plan line has no branch_id of its
   * own) and the customer's name, frozen into the entry so the list can say WHO
   * it was about after the customer is gone.
   *
   * One query for both — the branch lookup was already being made at every one of
   * these call sites, so naming the customer costs nothing extra.
   */
  protected async customerAudit(customerId: string): Promise<{ branchId: string | null; subject: string | null }> {
    const { data } = await this.db
      .from("customers")
      .select("branch_id, name")
      .eq("id", customerId)
      .maybeSingle();
    const row = data as { branch_id: string | null; name: string | null } | null;
    return { branchId: row?.branch_id ?? null, subject: row?.name ?? null };
  }

  /**
   * Just the frozen customer name, for a table that already owns its branch_id
   * (sales). `null` for a record with no customer — a walk-in sale.
   */
  protected async customerSubject(customerId: string | null): Promise<string | null> {
    if (!customerId) return null;
    return (await this.customerAudit(customerId)).subject;
  }

  /**
   * `UPDATE` one row by id and record the diff. The extra read is unavoidable:
   * PostgREST cannot return old values from an UPDATE. Covers the repeated
   * read-patch-diff dance for tables whose branch is their own `branch_id`
   * column (plans, products, branches, currencies, users, …).
   *
   * `branchColumn: null` marks a table with no branch dimension at all
   * (currencies, tenant_settings) — the entry gets `branch_id = null`, meaning
   * "tenant-wide", so every admin can see it.
   */
  protected async auditedUpdate<T extends { id: string }>(
    table: AuditInput["table"],
    id: string,
    values: object,
    opts: { action?: AuditInput["action"]; select?: string; branchColumn?: keyof T | null } = {},
  ): Promise<T> {
    const {
      action = "update",
      select = "*",
      branchColumn = "branch_id" as keyof T,
    } = opts;
    const { data: prior } = await this.db.from(table).select("*").eq("id", id).maybeSingle();
    const { data, error } = await this.db
      .from(table)
      .update(values)
      .eq("id", id)
      .select(select)
      .single();
    if (error) this.handleError(error);
    // Via `unknown`: `select` is a runtime string, so PostgREST cannot infer the
    // row shape and widens it to its error union.
    const after = data as unknown as T;
    await this.audit({
      table,
      recordId: id,
      action,
      before: prior,
      after,
      branchId: branchColumn ? ((after[branchColumn] as string | null) ?? null) : null,
    });
    return after;
  }

  /**
   * Hard-delete rows by id, snapshotting them first — a delete's whole value in
   * the trail is the copy of what was removed. `branchColumn` follows the same
   * rule as `auditedUpdate`.
   */
  protected async auditedDelete<T extends { id: string }>(
    table: AuditInput["table"],
    ids: string[],
    opts: { branchColumn?: keyof T | null } = {},
  ): Promise<void> {
    if (ids.length === 0) return;
    const { branchColumn = "branch_id" as keyof T } = opts;
    const { data: prior } = await this.db.from(table).select("*").in("id", ids);
    const { error } = await this.db.from(table).delete().in("id", ids);
    if (error) this.handleError(error);
    for (const row of (prior ?? []) as T[]) {
      await this.audit({
        table,
        recordId: row.id,
        action: "delete",
        before: row,
        branchId: branchColumn ? ((row[branchColumn] as string | null) ?? null) : null,
      });
    }
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
   * Returns the subset of `ids` that appear in `table.<column>` — i.e. the rows
   * still referenced by a child table. One query regardless of how many ids are
   * passed; powers the hard-delete vs soft-delete split in bulk deletes.
   */
  protected async referencedIdsIn(
    table: string,
    column: string,
    ids: string[],
  ): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const { data, error } = await this.db.from(table).select(column).in(column, ids);
    if (error) this.handleError(error);
    return new Set(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).map((row: any) => row[column] as string),
    );
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
    customer_plans: { kind: "inherited", joinedTable: "customers" },
    products: { kind: "shared" },
    sales: { kind: "owned" },
    custom_debts: { kind: "inherited", joinedTable: "customers" },
    debt_payments: { kind: "inherited", joinedTable: "customers" },
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
