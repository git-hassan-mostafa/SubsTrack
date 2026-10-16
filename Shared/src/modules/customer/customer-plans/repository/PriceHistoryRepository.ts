import i18n from "@shared/core/i18n";
import { BaseRepository } from "@shared/core/utils/BaseRepository";
import type { DbLinePriceChange, DbPlanPriceChange } from "@shared/core/types/db";
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

  async addMonthPrices(
    changes: PlanPriceChangePayload[],
  ): Promise<DbPlanPriceChange[]> {
    if (changes.length === 0) return [];
    const planIds = [...new Set(changes.map((c) => c.plan_id))];
    const months = [...new Set(changes.map((c) => c.from_month ?? ""))];
    const [plans, priors] = await Promise.all([
      this.db.from("plans").select("id, name, branch_id").in("id", planIds),
      this.db
        .from("plan_price_changes")
        .select("*")
        .in("plan_id", planIds)
        .in("from_month", months),
    ]);
    if (plans.error) this.handleError(plans.error);
    if (priors.error) this.handleError(priors.error);
    const { data, error } = await this.db
      .from("plan_price_changes")
      .insert(changes)
      .select();
    if (error) this.handleError(error);
    const saved = (data ?? []) as DbPlanPriceChange[];
    const planById = new Map(
      ((plans.data ?? []) as { id: string; name: string; branch_id: string | null }[]).map(
        (p) => [p.id, p],
      ),
    );
    for (const row of saved) {
      const plan = planById.get(row.plan_id);
      const before = latestMonthPrices(
        (priors.data ?? []) as DbPlanPriceChange[],
        row.from_month?.slice(0, 10) ?? "",
      ).get(row.plan_id);
      this.audit({
        table: "plans",
        recordId: row.plan_id,
        action: "update",
        before: monthPriceAuditFields(plan?.name ?? null, before ?? null),
        after: monthPriceAuditFields(plan?.name ?? null, row),
        branchId: plan?.branch_id ?? null,
      });
    }
    return saved;
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
