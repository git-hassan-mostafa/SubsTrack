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
    return (data ?? []) as DbSkippedMonth[];
  }
}

// Platform seam: web → Supabase directly; native → offline SQLite.
const impl: ISkippedMonthRepository =
  Platform.OS === 'web' ? new SkippedMonthRepository() : new OfflineSkippedMonthRepository();

export default impl;
