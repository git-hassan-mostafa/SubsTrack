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
  // Service lines carry no branch_id of their own; the audit row denormalizes the
  // owning customer's so a branch-scoped admin can filter on one column.
  private async branchOf(customerId: string): Promise<string | null> {
    const { data } = await this.db
      .from('customers')
      .select('branch_id')
      .eq('id', customerId)
      .maybeSingle();
    return (data as { branch_id: string | null } | null)?.branch_id ?? null;
  }

  async create(payload: CreateCustomerPlanPayload): Promise<DbCustomerPlan> {
    const { data, error } = await this.db
      .from('customer_plans')
      .insert(payload)
      .select(SELECT)
      .single();
    if (error) this.handleError(error);
    const created = data as DbCustomerPlan;
    await this.audit({
      table: 'customer_plans',
      recordId: created.id,
      action: 'create',
      after: created,
      branchId: await this.branchOf(created.customer_id),
    });
    return created;
  }

  // Both single-row patches funnel through here: read first (an UPDATE cannot
  // return old values), apply, record the diff.
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
    await this.audit({
      table: 'customer_plans',
      recordId: id,
      action,
      before: prior,
      after: updated,
      branchId: await this.branchOf(updated.customer_id),
    });
    return updated;
  }

  async update(
    id: string,
    payload: Partial<
      Pick<DbCustomerPlan, 'plan_id' | 'start_date' | 'active' | 'cancelled_at'>
    >,
  ): Promise<DbCustomerPlan> {
    // Re-activating a cancelled line reads as a restore, not a plain edit.
    const action = payload.active === true && payload.cancelled_at === null ? 'restore' : 'update';
    return this.patch(id, payload, action);
  }

  // Soft-delete: keeps the row (and its payment history) but stops billing.
  async cancel(id: string): Promise<DbCustomerPlan> {
    return this.patch(id, { active: false, cancelled_at: new Date().toISOString() }, 'update');
  }

  // Hard-delete a line. Its payments cascade-delete (FK ON DELETE CASCADE) —
  // an intentional exception to the no-hard-deletes rule for the form's
  // "delete permanently" checkbox; also used when a line has no payments.
  async delete(id: string): Promise<void> {
    // Snapshot before the row is gone — a delete's whole value in the trail is
    // the copy of what was removed.
    const { data: prior } = await this.db
      .from('customer_plans')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    const { error } = await this.db.from('customer_plans').delete().eq('id', id);
    if (error) this.handleError(error);
    const removed = prior as DbCustomerPlan | null;
    if (removed) {
      await this.audit({
        table: 'customer_plans',
        recordId: id,
        action: 'delete',
        before: removed,
        branchId: await this.branchOf(removed.customer_id),
      });
    }
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
