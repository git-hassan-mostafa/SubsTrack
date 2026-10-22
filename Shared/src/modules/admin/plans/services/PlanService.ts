import { repositories } from "@shared/core/runtime/repositories";
import type { Page, Plan, PlanUsage } from "@shared/core/types";
import type { BranchFilter } from "@shared/core/constants";
import i18n from "@shared/core/i18n";
import type { PlanColumns } from "@shared/modules/admin/plans/repository/IPlanRepository";
import {
  mapDbPlanToPlan,
  planUsageColumns,
} from "@shared/modules/admin/plans/utils/mapper";
import { priceHistoryService } from "@shared/modules/customer/customer-plans/services/PriceHistoryService";
import {
  currentBillingMonth,
  isPriceStartMonth,
  planPriceChanged,
} from "@shared/modules/customer/customer-plans/utils/priceHistory";
import type {
  PlanInput,
  PlanPageQuery,
} from "@shared/modules/admin/plans/utils/types";
import { canBePrepaid } from "@shared/modules/customer/customer-plans/utils/prepaidLine";

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
        ...this.columns(data),
        prepaid: canBePrepaid(data.usage) && data.prepaid,
        tenant_id: tenantId,
      });
      return mapDbPlanToPlan(row);
    } catch (err) {
      return this.rethrow(err);
    }
  }

  // priceFrom is the first month the new price applies to — gotcha #185.
  async updatePlan(
    previous: Plan,
    data: PlanInput,
    priceFrom: string = currentBillingMonth(),
  ): Promise<Plan> {
    if ((previous.usage === null) !== (data.usage === null)) {
      throw new Error(i18n.t("errors.plan_type_locked"));
    }
    if (previous.usage && data.usage && previous.usage.entry !== data.usage.entry) {
      throw new Error(i18n.t("errors.plan_usage_entry_locked"));
    }
    const priceChanged = !data.usage && planPriceChanged(previous, data);
    this.validate(data, priceFrom, priceChanged);
    const payload = this.columns(data);
    try {
      if (previous.prepaid !== data.prepaid) {
        await repositories().plan.setPrepaid(previous.id, data.prepaid);
      }
      if (priceChanged) {
        const { first, change } = await priceHistoryService.planChangePayloads(
          previous,
          data,
          priceFrom,
        );
        const row = await repositories().plan.updateWithPriceChange(
          previous.id,
          payload,
          first,
          {
            id: change.id,
            from_month: change.from_month,
            created_at: change.created_at,
          },
        );
        return mapDbPlanToPlan(row);
      }
      const row = await repositories().plan.update(previous.id, payload);
      return mapDbPlanToPlan(row);
    } catch (err) {
      return this.rethrow(err);
    }
  }

  // A plan whose line holds money keeps its prepaid switch (set_plan_prepaid).
  async hasPaidLine(id: string): Promise<boolean> {
    return repositories().plan.hasPaidLine(id);
  }

  async deletePlan(id: string): Promise<void> {
    await repositories().plan.delete(id);
  }

  async deleteManyPlans(ids: string[]): Promise<void> {
    await repositories().plan.deleteMany(ids);
  }

  private columns(data: PlanInput): PlanColumns {
    if (data.usage) {
      return {
        name: data.name.trim(),
        price: null,
        is_custom_price: false,
        duration_months: 1,
        currency_id: data.currencyId,
        branch_id: data.branchId,
        ...planUsageColumns(data.usage),
      };
    }
    return {
      name: data.name.trim(),
      price: data.isCustomPrice ? null : data.price,
      is_custom_price: data.isCustomPrice,
      duration_months: data.durationMonths,
      currency_id: data.isCustomPrice ? null : data.currencyId,
      branch_id: data.branchId,
      ...planUsageColumns(null),
    };
  }

  private validateUsage(usage: PlanUsage): void {
    if (usage.entry !== "reading" && usage.entry !== "direct") {
      throw new Error(i18n.t("errors.plan_usage_entry_required"));
    }
    if (!usage.unitName.trim()) {
      throw new Error(i18n.t("errors.plan_unit_name_required"));
    }
    if (!usage.feeName.trim()) {
      throw new Error(i18n.t("errors.plan_fee_name_required"));
    }
    const percent = usage.highUsagePercent;
    if (percent !== null && !(Number.isFinite(percent) && percent > 0)) {
      throw new Error(i18n.t("errors.plan_high_usage_percent_positive"));
    }
  }

  private validate(data: PlanInput, priceFrom?: string, priceChanged = false): void {
    if (!data.name.trim()) throw new Error(i18n.t("errors.plan_name_required"));
    if (data.prepaid && !canBePrepaid(data.usage)) {
      throw new Error(i18n.t("errors.prepaid_usage_plan"));
    }
    if (data.usage) {
      this.validateUsage(data.usage);
      return;
    }
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
    if (priceChanged && (!priceFrom || !isPriceStartMonth(priceFrom))) {
      throw new Error(i18n.t("errors.price_start_month"));
    }
  }

  private rethrow(err: unknown): never {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("prepaid_locked_paid")) {
      throw new Error(i18n.t("errors.plan_prepaid_locked_paid"));
    }
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
