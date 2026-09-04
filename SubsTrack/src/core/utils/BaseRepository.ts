import { supabase } from "@/src/shared/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import i18n from "@/src/core/i18n";
import { BRANCH_FILTER_UNASSIGNED, BranchFilter } from "../constants";
import { readFunctionsErrorBody } from "./functionsError";
import { logException } from "../errorLog/errorLogger";
import { buildAuditRow, type AuditInput } from "../audit";


/**
 * Describes how a row in a given table relates to a branch. There are exactly
 * three semantics in this codebase; declare one per branch-aware table in
 * BRANCH_SCOPES below and pass it to `applyBranchFilter`.
 *
 *   'owned'     — row has its OWN branch_id column. NULL means UNASSIGNED
 *                 (visible only to tenant-wide admins).
 *                 Used by: customers, users, expenses, charges, collections.
 *
 *   'shared'    — row has its own branch_id column. NULL means SHARED across
 *                 every branch (visible to all). When filtering to a specific
 *                 branch, shared rows are INCLUDED alongside that branch's rows.
 *                 Used by: plans.
 *
 *   'inherited' — row has no branch_id of its own; the branch is read from a
 *                 joined parent table. Always use `.select('..., parent!inner(branch_id)')`
 *                 in the query so PostgREST can apply the filter on the join.
 *                 Used by: customer_plans, sale_items (inherit from a parent).
 */
export type BranchScope =
  | { kind: "owned"; column?: string }
  | { kind: "shared"; column?: string }
  | { kind: "inherited"; joinedTable: string; column?: string };

export abstract class BaseRepository {
  protected readonly db: SupabaseClient = supabase;

  protected async ensureFreshSession(): Promise<void> {
    const { data, error } = await this.db.auth.getSession();
    if (error || !data.session) {
      this.handleError(new Error(i18n.t("errors.session_expired")));
    }
  }

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

  protected audit(input: AuditInput): void {
    void this.writeAudit(input);
  }

  private async writeAudit(input: AuditInput): Promise<void> {
    try {
      const owner = input.customerId ? await this.customerAudit(input.customerId) : null;
      const row = buildAuditRow(
        owner
          ? {
              ...input,
              subject: input.subject ?? owner.subject,
              branchId: input.branchId ?? owner.branchId,
            }
          : input,
      );
      if (!row) return;
      const { error } = await this.db.from("audit_logs").insert(row);
      if (error) throw new Error(error.message);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn("[audit] failed to record:", message);
      void logException({ source: "repository", message, context: `audit:${input.table}` });
    }
  }

  protected async customerAudit(
    customerId: string,
  ): Promise<{ branchId: string | null; subject: string | null; customerId: string }> {
    const { data } = await this.db
      .from("customers")
      .select("branch_id, name")
      .eq("id", customerId)
      .maybeSingle();
    const row = data as { branch_id: string | null; name: string | null } | null;
    return { branchId: row?.branch_id ?? null, subject: row?.name ?? null, customerId };
  }

  protected async customerSubject(customerId: string | null): Promise<string | null> {
    if (!customerId) return null;
    return (await this.customerAudit(customerId)).subject;
  }

  protected async auditedUpdate<T extends { id: string }>(
    table: AuditInput["table"],
    id: string,
    values: object,
    opts: {
      action?: AuditInput["action"];
      select?: string;
      branchColumn?: keyof T | null;
      audit?: { branchId?: string | null; subject?: string | null };
    } = {},
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
    const after = data as unknown as T;
    this.audit({
      table,
      recordId: id,
      action,
      before: prior,
      after,
      branchId:
        opts.audit?.branchId ??
        (branchColumn ? ((after[branchColumn] as string | null) ?? null) : null),
      subject: opts.audit?.subject,
    });
    return after;
  }

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
      this.audit({
        table,
        recordId: row.id,
        action: "delete",
        before: row,
        branchId: branchColumn ? ((row[branchColumn] as string | null) ?? null) : null,
      });
    }
  }

  protected async handleFunctionsError(error: unknown): Promise<never> {
    const body = await readFunctionsErrorBody(error);
    if (body?.error) {
      console.error("[Edge Function Error]", body.error);
      throw new Error(body.error);
    }
    this.handleError(error);
  }

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

  protected BRANCH_SCOPES = {
    customers: { kind: "owned" },
    users: { kind: "owned" },
    plans: { kind: "shared" },
    charges: { kind: "owned" },
    collections: { kind: "owned" },
    customer_plans: { kind: "inherited", joinedTable: "customers" },
    products: { kind: "shared" },
    services: { kind: "shared" },
    sales: { kind: "owned" },
    expenses: { kind: "owned" },
    stock_movements: { kind: "inherited", joinedTable: "products" },
  } satisfies Record<string, BranchScope>;

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
      return query.or(`${column}.is.null,${column}.eq.${filter}`);
    }
    return query.eq(path, filter);
  }
}
