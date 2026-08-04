import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { DbSkippedMonth } from '@/src/core/types/db';
import type { ISkippedMonthRepository, SkippedMonthPayload } from './ISkippedMonthRepository';
import { OfflineSkippedMonthRepository } from './SkippedMonthRepository.offline';

export class SkippedMonthRepository extends BaseRepository implements ISkippedMonthRepository {
  async findActiveByCustomer(customerId: string): Promise<DbSkippedMonth[]> {
    const { data, error } = await this.db
      .from('skipped_months')
      .select('*')
      .eq('customer_id', customerId)
      .eq('skipped', true)
      .order('billing_month');
    if (error) this.handleError(error);
    return (data ?? []) as DbSkippedMonth[];
  }

  // Branch scoping is left to RLS (skips inherit the customer's branch).
  async findActive(): Promise<DbSkippedMonth[]> {
    const { data, error } = await this.db
      .from('skipped_months')
      .select('*')
      .eq('skipped', true);
    if (error) this.handleError(error);
    return (data ?? []) as DbSkippedMonth[];
  }

  async upsertMany(payloads: SkippedMonthPayload[]): Promise<DbSkippedMonth[]> {
    if (payloads.length === 0) return [];
    const { data, error } = await this.db
      .from('skipped_months')
      .upsert(payloads, { onConflict: 'customer_plan_id,billing_month' })
      .select();
    if (error) this.handleError(error);
    const saved = (data ?? []) as DbSkippedMonth[];
    const branches = new Map<string, string | null>();
    for (const s of saved) {
      if (!branches.has(s.customer_id)) branches.set(s.customer_id, await this.branchOf(s.customer_id));
    }
    for (const s of saved) {
      // One row covers both directions: `skipped: false` is an unskip, which
      // reads as restoring the month to payable.
      await this.audit({
        table: 'skipped_months',
        recordId: s.id,
        action: s.skipped ? 'create' : 'restore',
        after: s,
        branchId: branches.get(s.customer_id) ?? null,
      });
    }
    return saved;
  }

  // Skips carry no branch_id of their own; the audit row denormalizes the owning
  // customer's so a branch-scoped admin can filter on one column.
  private async branchOf(customerId: string): Promise<string | null> {
    const { data } = await this.db
      .from('customers')
      .select('branch_id')
      .eq('id', customerId)
      .maybeSingle();
    return (data as { branch_id: string | null } | null)?.branch_id ?? null;
  }
}

// Platform seam: web → Supabase directly; native → offline SQLite.
const impl: ISkippedMonthRepository =
  Platform.OS === 'web' ? new SkippedMonthRepository() : new OfflineSkippedMonthRepository();

export default impl;
