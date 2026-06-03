import type { Plan, TierPlan, TenantUsage } from '@/src/core/types';
import type { BranchFilter } from '@/src/core/constants';
import type { DbPlan } from '@/src/core/types/db';
import i18n from '@/src/core/i18n';
import { PlanRepository } from '../repository/PlanRepository';
import { tierService } from '@/src/modules/subscription/services/TierService';

function mapDbPlanToPlan(db: DbPlan): Plan {
  return {
    id: db.id,
    name: db.name,
    price: db.price != null ? Number(db.price) : null,
    isCustomPrice: db.is_custom_price,
    durationMonths: db.duration_months,
    currencyId: db.currency_id,
    branchId: db.branch_id,
    tenantId: db.tenant_id,
    createdAt: db.created_at,
  };
}

type PlanInput = Pick<Plan, 'name' | 'isCustomPrice' | 'price' | 'durationMonths' | 'currencyId' | 'branchId'>

export class PlanService {
  private repository = new PlanRepository();

  async getPlans(branchFilter: BranchFilter = null): Promise<Plan[]> {
    const rows = await this.repository.findAll(branchFilter);
    return rows.map(mapDbPlanToPlan);
  }

  async createPlan(
    data: PlanInput,
    tenantId: string,
    tier: TierPlan,
    usage: TenantUsage,
  ): Promise<Plan> {
    this.validate(data);
    tierService.assertCanCreate(tier, usage, 'plans');
    if (data.durationMonths > 1) tierService.assertMultiMonth(tier);
    try {
      const row = await this.repository.create({
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

  async updatePlan(id: string, data: PlanInput, tier: TierPlan): Promise<Plan> {
    this.validate(data);
    if (data.durationMonths > 1) tierService.assertMultiMonth(tier);
    try {
      const row = await this.repository.update(id, {
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
    await this.repository.delete(id);
  }

  private validate(data: PlanInput): void {
    if (!data.name.trim()) throw new Error(i18n.t('errors.plan_name_required'));
    if (data.durationMonths < 1 || !Number.isInteger(data.durationMonths)) {
      throw new Error(i18n.t('errors.plan_duration_invalid'));
    }
    if (data.durationMonths > 1 && data.isCustomPrice) {
      throw new Error(i18n.t('errors.multimonth_no_custom_price'));
    }
    if (!data.isCustomPrice) {
      if (data.price === null || data.price === undefined) throw new Error(i18n.t('errors.plan_fixed_needs_price'));
      if (typeof data.price !== 'number' || Number.isNaN(data.price)) throw new Error(i18n.t('errors.plan_fixed_needs_price'));
      if (data.price <= 0) throw new Error(i18n.t('errors.plan_price_positive'));
    }
    if (!data.branchId) {
      throw new Error(i18n.t('errors.plan_needs_branch'));
    }
  }

  private rethrow(err: unknown): never {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('uq_plans_name_tenant') || msg.includes('uq_plans_name_tenant_branch') || msg.includes('duplicate')) {
      throw new Error(i18n.t('errors.plan_name_exists'));
    }
    throw err instanceof Error ? err : new Error(i18n.t('errors.connection_error'));
  }
}
