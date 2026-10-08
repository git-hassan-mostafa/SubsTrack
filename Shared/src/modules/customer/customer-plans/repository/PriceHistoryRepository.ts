import { BaseRepository } from "@shared/core/utils/BaseRepository";
import type { DbLinePriceChange, DbPlanPriceChange } from "@shared/core/types/db";
import type {
  IPriceHistoryRepository,
  LinePriceChangePayload,
  PlanPriceChangePayload,
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

  addPlanChange(
    first: PlanPriceChangePayload,
    change: PlanPriceChangePayload,
  ): Promise<void> {
    return this.append("plan_price_changes", first, change);
  }

  addLineChange(
    first: LinePriceChangePayload,
    change: LinePriceChangePayload,
  ): Promise<void> {
    return this.append("line_price_changes", first, change);
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
