import { BaseRepository } from "@shared/core/utils/BaseRepository";
import { type BranchFilter } from "@shared/core/constants";
import type { DbExpense } from "@shared/core/types/db";
import type {
  CreateExpensePayload,
  ExpenseAmountRow,
  IExpenseRepository,
} from "@shared/modules/transaction/expenses/repository/IExpenseRepository";

export class ExpenseRepository
  extends BaseRepository
  implements IExpenseRepository
{
  async findInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter = null,
  ): Promise<DbExpense[]> {
    return this.readEveryRow<DbExpense>((from, to) =>
      this.applyBranchFilter(
        this.db
          .from("expenses")
          .select("*", { count: "exact" })
          .is("voided_at", null)
          .gte("incurred_at", startIso)
          .lt("incurred_at", endExclusiveIso)
          .order("incurred_at", { ascending: false })
          .order("id")
          .range(from, to),
        branchFilter,
        this.BRANCH_SCOPES.expenses,
      ),
    );
  }

  async create(payload: CreateExpensePayload): Promise<DbExpense> {
    const { data, error } = await this.db
      .from("expenses")
      .insert({
        ...payload,
        voided_at: null,
        voided_by: null,
        void_reason: null,
      })
      .select("*")
      .single();
    if (error) this.handleError(error);
    return data as DbExpense;
  }

  async void(
    id: string,
    voidedBy: string,
    reason: string | null,
  ): Promise<DbExpense> {
    const { data, error } = await this.db
      .from("expenses")
      .update({
        voided_at: new Date().toISOString(),
        voided_by: voidedBy,
        void_reason: reason,
      })
      .eq("id", id)
      .is("voided_at", null)
      .select("*")
      .single();
    if (error) this.handleError(error);
    return data as DbExpense;
  }

  async totalsInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter = null,
  ): Promise<ExpenseAmountRow[]> {
    const rows = await this.readEveryRow<{
      incurred_at: string;
      amount: number;
      rate_per_usd_snapshot: number;
    }>((from, to) =>
      this.applyBranchFilter(
        this.db
          .from("expenses")
          .select("incurred_at, amount, rate_per_usd_snapshot", { count: "exact" })
          .is("voided_at", null)
          .gte("incurred_at", startIso)
          .lt("incurred_at", endExclusiveIso)
          .order("id")
          .range(from, to),
        branchFilter,
        this.BRANCH_SCOPES.expenses,
      ),
    );
    return rows.map((r) => ({
      incurredAt: r.incurred_at,
      amount: Number(r.amount),
      ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
    }));
  }
}
