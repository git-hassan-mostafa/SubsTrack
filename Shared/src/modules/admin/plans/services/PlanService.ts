import { repositories } from "@shared/core/runtime/repositories";
import type { Page, Plan } from "@shared/core/types";
import type { BranchFilter } from "@shared/core/constants";
import i18n from "@shared/core/i18n";
import { mapDbPlanToPlan } from "@shared/modules/admin/plans/utils/mapper";
import type {
  PlanInput,
  PlanPageQuery,
} from "@shared/modules/admin/plans/utils/types";

class PlanService {
  async getPlans(branchFilter: BranchFilter = null): Promise<Plan[]> {
    const rows = await repositories().plan.findAll(branchFilter);
    return rows.map(mapDbPlanToPlan);
  }

  async getPlanPage(query: PlanPageQuery): Promise<Page<Plan>> {
    const page = await repositories().plan.findPage(query);
    return { rows: page.rows.map(mapDbPlanToPlan), total: page.total };
  }

  async createPlan(data: PlanInput, tenantId: string): Promise<Plan> {
    this.validate(data);
    try {
      const row = await repositories().plan.create({
        name: data.name.trim(),
        price: data.isCustomPrice ? null : data.price,
        is_custom_price: data.isCustomPrice,
        duration_months: data.durationMonths,
        currency_id: data.isCustomPrice ? null : data.currencyId,
        branch_id: data.branchId,
        tenant_id: tenantId,
      });
      return mapDbPlanToPlan(row);
    } catch (err) {
      return this.rethrow(err);
    }
  }

  async updatePlan(id: string, data: PlanInput): Promise<Plan> {
    this.validate(data);
    try {
      const row = await repositories().plan.update(id, {
        name: data.name.trim(),
        price: data.isCustomPrice ? null : data.price,
        is_custom_price: data.isCustomPrice,
        duration_months: data.durationMonths,
        currency_id: data.isCustomPrice ? null : data.currencyId,
        branch_id: data.branchId,
      });
      return mapDbPlanToPlan(row);
    } catch (err) {
      return this.rethrow(err);
    }
  }

  async deletePlan(id: string): Promise<void> {
    await repositories().plan.delete(id);
  }

  async deleteManyPlans(ids: string[]): Promise<void> {
    await repositories().plan.deleteMany(ids);
  }

  private validate(data: PlanInput): void {
    if (!data.name.trim()) throw new Error(i18n.t("errors.plan_name_required"));
    if (data.durationMonths < 1 || !Number.isInteger(data.durationMonths)) {
      throw new Error(i18n.t("errors.plan_duration_invalid"));
    }
    if (data.durationMonths > 1 && data.isCustomPrice) {
      throw new Error(i18n.t("errors.multimonth_no_custom_price"));
    }
    if (!data.isCustomPrice) {
      if (data.price === null || data.price === undefined)
        throw new Error(i18n.t("errors.plan_fixed_needs_price"));
      if (typeof data.price !== "number" || Number.isNaN(data.price))
        throw new Error(i18n.t("errors.plan_fixed_needs_price"));
      if (data.price <= 0)
        throw new Error(i18n.t("errors.plan_price_positive"));
    }
  }

  private rethrow(err: unknown): never {
    const msg = err instanceof Error ? err.message : "";
    if (
      msg.includes("uq_plans_name_tenant") ||
      msg.includes("uq_plans_name_tenant_branch") ||
      msg.includes("duplicate")
    ) {
      throw new Error(i18n.t("errors.plan_name_exists"));
    }
    throw err instanceof Error
      ? err
      : new Error(i18n.t("errors.connection_error"));
  }
}

export default new PlanService();
