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
    this.audit({
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

  // The subset of the given currencies referenced by any plan, payment, or
  // service line's special price. All three FKs are ON DELETE RESTRICT, so a
  // missing one turns an intended soft-delete into a raw FK error.
  async referencedIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    // Money references a currency twice over: on the bill and on the hand-over
    // that paid it, each with its own frozen rate.
    const [plans, charges, collections, lines] = await Promise.all([
      this.referencedIdsIn('plans', 'currency_id', ids),
      this.referencedIdsIn('charges', 'currency_id', ids),
      this.referencedIdsIn('collections', 'currency_id', ids),
      this.referencedIdsIn('customer_plans', 'custom_currency_id', ids),
    ]);
    return new Set([...plans, ...charges, ...collections, ...lines]);
  }

  // Total references to this currency. Used by CurrencyService to decide
  // hard-delete vs soft-delete.
  async countReferences(id: string): Promise<number> {
    const [plans, charges, collections, lines] = await Promise.all([
      this.db.from('plans').select('id', { count: 'exact', head: true }).eq('currency_id', id),
      this.db.from('charges').select('id', { count: 'exact', head: true }).eq('currency_id', id),
      this.db
        .from('collections')
        .select('id', { count: 'exact', head: true })
        .eq('currency_id', id),
      this.db
        .from('customer_plans')
        .select('id', { count: 'exact', head: true })
        .eq('custom_currency_id', id),
    ]);
    if (plans.error) this.handleError(plans.error);
    if (charges.error) this.handleError(charges.error);
    if (collections.error) this.handleError(collections.error);
    if (lines.error) this.handleError(lines.error);
    return (plans.count ?? 0) + (charges.count ?? 0) + (collections.count ?? 0) + (lines.count ?? 0);
  }
}

// Platform seam: web talks to Supabase directly (unchanged); native uses the
// offline SQLite repository. Services import this default, so neither services
// nor slices change. The offline class is only constructed on native, so web
// never opens a local DB.
const impl: ICurrencyRepository =
  Platform.OS === 'web' ? new CurrencyRepository() : new OfflineCurrencyRepository();

export default impl;
