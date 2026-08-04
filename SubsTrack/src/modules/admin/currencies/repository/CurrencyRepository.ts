import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { DbCurrency } from '@/src/core/types/db';
import type { ICurrencyRepository } from './ICurrencyRepository';
import { OfflineCurrencyRepository } from './CurrencyRepository.offline';

export class CurrencyRepository extends BaseRepository implements ICurrencyRepository {
  async findAll(): Promise<DbCurrency[]> {
    const { data, error } = await this.db
      .from('currencies')
      .select('*')
      .order('active', { ascending: false })
      .order('code');
    if (error) this.handleError(error);
    return (data ?? []) as DbCurrency[];
  }

  async create(
    payload: Omit<DbCurrency, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<DbCurrency> {
    const { data, error } = await this.db
      .from('currencies')
      .insert(payload)
      .select()
      .single();
    if (error) this.handleError(error);
    const created = data as DbCurrency;
    // Currencies are tenant-wide — no branch dimension, so every admin sees it.
    await this.audit({
      table: 'currencies',
      recordId: created.id,
      action: 'create',
      after: created,
    });
    return created;
  }

  async update(
    id: string,
    payload: Partial<
      Pick<DbCurrency, 'code' | 'name' | 'symbol' | 'rate_per_usd' | 'decimals' | 'active'>
    >,
  ): Promise<DbCurrency> {
    return this.auditedUpdate<DbCurrency>('currencies', id, payload, {
      action: payload.active === true ? 'restore' : 'update',
      branchColumn: null,
    });
  }

  async delete(id: string): Promise<void> {
    await this.deleteMany([id]);
  }

  // Hard-delete many currencies in one statement.
  async deleteMany(ids: string[]): Promise<void> {
    await this.auditedDelete<DbCurrency>('currencies', ids, { branchColumn: null });
  }

  // Soft-delete many currencies in one statement.
  async deactivateMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    for (const id of ids) {
      await this.auditedUpdate<DbCurrency>(
        'currencies',
        id,
        { active: false },
        { branchColumn: null },
      );
    }
  }

  // The subset of the given currencies referenced by any plan or payment.
  async referencedIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const [plans, payments] = await Promise.all([
      this.referencedIdsIn('plans', 'currency_id', ids),
      this.referencedIdsIn('payments', 'currency_id', ids),
    ]);
    return new Set([...plans, ...payments]);
  }

  // Returns the total number of plans + payments referencing this currency.
  // Used by CurrencyService to decide hard-delete vs soft-delete.
  async countReferences(id: string): Promise<number> {
    const [plans, payments] = await Promise.all([
      this.db.from('plans').select('id', { count: 'exact', head: true }).eq('currency_id', id),
      this.db
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('currency_id', id),
    ]);
    if (plans.error) this.handleError(plans.error);
    if (payments.error) this.handleError(payments.error);
    return (plans.count ?? 0) + (payments.count ?? 0);
  }
}

// Platform seam: web talks to Supabase directly (unchanged); native uses the
// offline SQLite repository. Services import this default, so neither services
// nor slices change. The offline class is only constructed on native, so web
// never opens a local DB.
const impl: ICurrencyRepository =
  Platform.OS === 'web' ? new CurrencyRepository() : new OfflineCurrencyRepository();

export default impl;
