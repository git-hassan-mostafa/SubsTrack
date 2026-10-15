import i18n from "@shared/core/i18n";
import { BaseRepository } from "@shared/core/utils/BaseRepository";
import type { DbLinePriceChange, DbPlanPriceChange } from "@shared/core/types/db";
import type {
  IPriceHistoryRepository,
  LinePriceChangePayload,
} from "@shared/modules/customer/customer-plans/repository/IPriceHistoryRepository";

type ChangeTable = "plan_price_changes" | "line_price_changes";

export class PriceHistoryRepository
  extends BaseRepository
  implements IPriceHistoryRepository
{
  findPlanChanges(planIds: string[]): Promise<DbPlanPriceChange[]> {
    return this.readChanges<DbPlanPriceChange>("plan_price_changes", "plan_id", planIds);
  }

  findLineChanges(customerPlanIds: string[]): Promise<DbLinePriceChange[]> {
    return this.readChanges<DbLinePriceChange>(
      "line_price_changes",
      "customer_plan_id",
      customerPlanIds,
    );
  }

  addLineChange(
    first: LinePriceChangePayload,
    change: LinePriceChangePayload,
  ): Promise<void> {
    return this.append("line_price_changes", first, change);
  }

  async updatePlanChangeFromMonth(
    id: string,
    planId: string,
    fromMonth: string,
    oldFromMonth: string | null,
  ): Promise<DbPlanPriceChange> {
    const { data: plan } = await this.db
      .from("plans")
      .select("name, branch_id")
      .eq("id", planId)
      .maybeSingle();
    const { data, error } = await this.db
      .from("plan_price_changes")
      .update({ from_month: fromMonth })
      .eq("id", id)
      .eq("plan_id", planId)
      .select()
      .maybeSingle();
    if (error) this.handleError(error);
    if (!data) {
      throw new Error(i18n.t("errors.price_change_not_found"));
    }
    const updated = data as DbPlanPriceChange;
    this.audit({
      table: "plans",
      recordId: planId,
      action: "update",
      before: { from_month: oldFromMonth, name: plan?.name ?? null },
      after: { from_month: fromMonth, name: plan?.name ?? null },
      branchId: plan?.branch_id ?? null,
    });
    return updated;
  }

  private async readChanges<R>(
    table: ChangeTable,
    column: string,
    ids: string[],
  ): Promise<R[]> {
    if (ids.length === 0) return [];
    return this.readEveryRow<R>((from, to) =>
      this.db
        .from(table)
        .select("*", { count: "exact" })
        .in(column, ids)
        .order("id")
        .range(from, to),
    );
  }

  private async append(table: ChangeTable, first: object, change: object): Promise<void> {
    const kept = await this.db
      .from(table)
      .upsert(first, { onConflict: "id", ignoreDuplicates: true });
    if (kept.error) this.handleError(kept.error);
    const { error } = await this.db.from(table).insert(change);
    if (error) this.handleError(error);
  }
}
