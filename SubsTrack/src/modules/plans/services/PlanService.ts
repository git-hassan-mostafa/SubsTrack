import type { Plan } from '@/src/core/types';
import type { DbPlan } from '@/src/core/types/db';
import { PlanRepository } from '../repository/PlanRepository';

function mapDbPlanToPlan(db: DbPlan): Plan {
  return {
    id: db.id,
    name: db.name,
    price: db.price,
    isCustomPrice: db.is_custom_price,
    tenantId: db.tenant_id,
    createdAt: db.created_at,
  };
}

interface PlanInput {
  name: string;
  isCustomPrice: boolean;
  price: number | null;
}

export class PlanService {
  private repository = new PlanRepository();

  async getPlans(): Promise<Plan[]> {
    const rows = await this.repository.findAll();
    return rows.map(mapDbPlanToPlan);
  }

  async createPlan(data: PlanInput, tenantId: string): Promise<Plan> {
    this.validate(data);
    try {
      const row = await this.repository.create({
        name: data.name.trim(),
        price: data.isCustomPrice ? null : data.price,
        is_custom_price: data.isCustomPrice,
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
      const row = await this.repository.update(id, {
        name: data.name.trim(),
        price: data.isCustomPrice ? null : data.price,
        is_custom_price: data.isCustomPrice,
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
    if (!data.name.trim()) throw new Error('Plan name is required');
    if (!data.isCustomPrice) {
      if (data.price === null || data.price === undefined) throw new Error('Fixed plans require a price');
      if (typeof data.price !== 'number' || Number.isNaN(data.price)) throw new Error('Fixed plans require a price');
      if (data.price <= 0) throw new Error('Price must be greater than 0');
    }
  }

  private rethrow(err: unknown): never {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('uq_plans_name_tenant') || msg.includes('duplicate')) {
      throw new Error('A plan with this name already exists');
    }
    throw err instanceof Error ? err : new Error('Connection error. Please try again.');
  }
}
