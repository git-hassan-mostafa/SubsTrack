import type { DbLinePriceChange, DbPlanPriceChange } from "@shared/core/types/db";
import { OfflineBaseRepository } from "@/src/core/offline/OfflineBaseRepository";
import { insertDirty } from "@/src/core/offline/db/dml";
import type {
  IPriceHistoryRepository,
  LinePriceChangePayload,
  PlanPriceChangePayload,
} from "@shared/modules/customer/customer-plans/repository/IPriceHistoryRepository";

type ChangeTable = "plan_price_changes" | "line_price_changes";

export class OfflinePriceHistoryRepository
  extends OfflineBaseRepository
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
    const rows = await this.all(
      `SELECT * FROM ${table} WHERE ${column} IN (${ids.map(() => "?").join(", ")})`,
      ids,
    );
    return this.decodeAll<R>(table, rows);
  }

  private async append(
    table: ChangeTable,
    first: PlanPriceChangePayload | LinePriceChangePayload,
    change: PlanPriceChangePayload | LinePriceChangePayload,
  ): Promise<void> {
    await this.write(async (db) => {
      const kept = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM ${table} WHERE id = ?`,
        [first.id],
      );
      if (!kept) await insertDirty(db, table, { ...first, updated_at: first.created_at });
      await insertDirty(db, table, { ...change, updated_at: change.created_at });
    });
  }
}
