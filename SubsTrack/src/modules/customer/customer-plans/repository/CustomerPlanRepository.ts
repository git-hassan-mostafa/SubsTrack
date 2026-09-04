import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { DbCustomerPlan } from '@/src/core/types/db';
import type {
  CreateCustomerPlanPayload,
  ICustomerPlanRepository,
} from './ICustomerPlanRepository';
import { OfflineCustomerPlanRepository } from './CustomerPlanRepository.offline';

const SELECT = '*, plans(*)';

export class CustomerPlanRepository extends BaseRepository implements ICustomerPlanRepository {
  async create(payload: CreateCustomerPlanPayload): Promise<DbCustomerPlan> {
    const { data, error } = await this.db
      .from('customer_plans')
      .insert(payload)
      .select(SELECT)
      .single();
    if (error) this.handleError(error);
    const created = data as DbCustomerPlan;
    this.audit({
      table: 'customer_plans',
      recordId: created.id,
      action: 'create',
      after: created,
      customerId: created.customer_id,
    });
    return created;
  }

  private async patch(
    id: string,
    values: Record<string, unknown>,
    action: 'update' | 'restore',
  ): Promise<DbCustomerPlan> {
    const { data: prior } = await this.db
      .from('customer_plans')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    const { data, error } = await this.db
      .from('customer_plans')
      .update(values)
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) this.handleError(error);
    const updated = data as DbCustomerPlan;
    this.audit({
      table: 'customer_plans',
      recordId: id,
      action,
      before: prior,
      after: updated,
      customerId: updated.customer_id,
    });
    return updated;
  }

  async update(
    id: string,
    payload: Partial<
      Pick<
        DbCustomerPlan,
        | 'plan_id'
        | 'start_date'
        | 'active'
        | 'cancelled_at'
        | 'custom_price'
        | 'custom_currency_id'
      >
    >,
  ): Promise<DbCustomerPlan> {
    const action = payload.active === true && payload.cancelled_at === null ? 'restore' : 'update';
    return this.patch(id, payload, action);
  }

  async cancel(id: string): Promise<DbCustomerPlan> {
    return this.patch(id, { active: false, cancelled_at: new Date().toISOString() }, 'update');
  }

  async delete(id: string): Promise<void> {
    const { data: prior } = await this.db
      .from('customer_plans')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    const { error } = await this.db.from('customer_plans').delete().eq('id', id);
    if (error) this.handleError(error);
    const removed = prior as DbCustomerPlan | null;
    if (removed) {
      this.audit({
        table: 'customer_plans',
        recordId: id,
        action: 'delete',
        before: removed,
        customerId: removed.customer_id,
      });
    }
  }

  async countPayments(id: string): Promise<number> {
    const { count, error } = await this.db
      .from('charges')
      .select('id', { count: 'exact', head: true })
      .eq('customer_plan_id', id);
    if (error) this.handleError(error);
    return count ?? 0;
  }

  async findPaidLineIds(customerId: string): Promise<string[]> {
    const { data, error } = await this.db
      .from('collection_items')
      .select('charges!inner(customer_plan_id, customer_id), collections!inner(voided_at)')
      .eq('charges.customer_id', customerId)
      .not('charges.customer_plan_id', 'is', null)
      .is('collections.voided_at', null);
    if (error) this.handleError(error);
    type Row = { charges: { customer_plan_id: string | null } };
    const ids = ((data as unknown as Row[] | null) ?? [])
      .map((r) => r.charges?.customer_plan_id)
      .filter((v): v is string => !!v);
    return [...new Set(ids)];
  }
}

const impl: ICustomerPlanRepository =
  Platform.OS === 'web' ? new CustomerPlanRepository() : new OfflineCustomerPlanRepository();

export default impl;
