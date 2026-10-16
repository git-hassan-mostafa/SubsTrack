import i18n from "@shared/core/i18n";
import type { DbLinePriceChange, DbPlanPriceChange } from "@shared/core/types/db";
import { OfflineBaseRepository } from "@/src/core/offline/OfflineBaseRepository";
import { insertDirty, updateDirty } from "@/src/core/offline/db/dml";
import { nowIso } from "@shared/core/utils/ids";
import type {
  IPriceHistoryRepository,
  LinePriceChangePayload,
  PlanPriceChangePayload,
} from "@shared/modules/customer/customer-plans/repository/IPriceHistoryRepository";
import {
  latestMonthPrices,
  monthPriceAuditFields,
} from "@shared/modules/customer/customer-plans/repository/monthPriceAudit";

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
    return this.write(async (db) => {
      const plan = await db.getFirstAsync<{
        name: string;
        branch_id: string | null;
      }>("SELECT name, branch_id FROM plans WHERE id = ?", [planId]);
      const row = await db.getFirstAsync<{ id: string }>(
        "SELECT id FROM plan_price_changes WHERE id = ? AND plan_id = ?",
        [id, planId],
      );
      if (!row) throw new Error(i18n.t("errors.price_change_not_found"));
      await updateDirty(db, "plan_price_changes", id, {
        from_month: fromMonth,
        updated_at: nowIso(),
      });
      const updated = this.decodeOne<DbPlanPriceChange>(
        "plan_price_changes",
        await this.first("SELECT * FROM plan_price_changes WHERE id = ?", [id]),
      );
      if (!updated) throw new Error(i18n.t("errors.price_change_not_found"));
      await this.auditIn(db, {
        table: "plans",
        recordId: planId,
        action: "update",
        before: { from_month: oldFromMonth, name: plan?.name ?? null },
        after: { from_month: fromMonth, name: plan?.name ?? null },
        branchId: plan?.branch_id ?? null,
      });
      return updated;
    });
  }

  async addMonthPrices(
    changes: PlanPriceChangePayload[],
  ): Promise<DbPlanPriceChange[]> {
    if (changes.length === 0) return [];
    const rows: DbPlanPriceChange[] = changes.map((c) => ({
      ...c,
      updated_at: c.created_at,
    }));
    await this.write(async (db) => {
      for (const row of rows) {
        const month = row.from_month?.slice(0, 10) ?? "";
        const plan = await db.getFirstAsync<{
          name: string;
          branch_id: string | null;
        }>("SELECT name, branch_id FROM plans WHERE id = ?", [row.plan_id]);
        const priors = this.decodeAll<DbPlanPriceChange>(
          "plan_price_changes",
          await db.getAllAsync(
            "SELECT * FROM plan_price_changes WHERE plan_id = ? AND from_month = ?",
            [row.plan_id, month],
          ),
        );
        const before = latestMonthPrices(priors, month).get(row.plan_id);
        await insertDirty(db, "plan_price_changes", row);
        await this.auditIn(db, {
          table: "plans",
          recordId: row.plan_id,
          action: "update",
          before: monthPriceAuditFields(plan?.name ?? null, before ?? null),
          after: monthPriceAuditFields(plan?.name ?? null, row),
          branchId: plan?.branch_id ?? null,
        });
      }
    });
    return rows;
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
    first: LinePriceChangePayload,
    change: LinePriceChangePayload,
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
