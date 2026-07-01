import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { DbCustomerPlan } from '@/src/core/types/db';
import type {
  CreateCustomerPlanPayload,
  ICustomerPlanRepository,
} from './ICustomerPlanRepository';
import { OfflineCustomerPlanRepository } from './CustomerPlanRepository.offline';

// One row per service line. No branch_id of its own — RLS scopes lines via the
// owning customer's branch (see the customer_plans_all policy), exactly like
// payments. The joined plan is loaded for display + price snapshotting.
const SELECT = '*, plans(*)';

export class CustomerPlanRepository extends BaseRepository implements ICustomerPlanRepository {
  async create(payload: CreateCustomerPlanPayload): Promise<DbCustomerPlan> {
    const { data, error } = await this.db
      .from('customer_plans')
      .insert(payload)
      .select(SELECT)
      .single();
    if (error) this.handleError(error);
    return data as DbCustomerPlan;
  }

  async update(
    id: string,
    payload: Partial<Pick<DbCustomerPlan, 'plan_id' | 'start_date'>>,
  ): Promise<DbCustomerPlan> {
    const { data, error } = await this.db
      .from('customer_plans')
      .update(payload)
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) this.handleError(error);
    return data as DbCustomerPlan;
  }

  // Soft-delete: keeps the row (and its payment history) but stops billing.
  async cancel(id: string): Promise<DbCustomerPlan> {
    const { data, error } = await this.db
      .from('customer_plans')
      .update({ active: false, cancelled_at: new Date().toISOString() })
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) this.handleError(error);
    return data as DbCustomerPlan;
  }

  // Hard-delete a line (only safe when it has no payments — payments cascade).
  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('customer_plans').delete().eq('id', id);
    if (error) this.handleError(error);
  }

  async countPayments(id: string): Promise<number> {
    const { count, error } = await this.db
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('customer_plan_id', id);
    if (error) this.handleError(error);
    return count ?? 0;
  }
}

// Platform seam: web → Supabase directly (unchanged); native → offline SQLite.
const impl: ICustomerPlanRepository =
  Platform.OS === 'web' ? new CustomerPlanRepository() : new OfflineCustomerPlanRepository();

export default impl;
