import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { DbCurrency } from '@/src/core/types/db';

class CurrencyRepository extends BaseRepository {
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
    return data as DbCurrency;
  }

  async update(
    id: string,
    payload: Partial<
      Pick<DbCurrency, 'code' | 'name' | 'symbol' | 'rate_per_usd' | 'decimals' | 'active'>
    >,
  ): Promise<DbCurrency> {
    const { data, error } = await this.db
      .from('currencies')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) this.handleError(error);
    return data as DbCurrency;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('currencies').delete().eq('id', id);
    if (error) this.handleError(error);
  }

  // Hard-delete many currencies in one statement.
  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.db.from('currencies').delete().in('id', ids);
    if (error) this.handleError(error);
  }

  // Soft-delete many currencies in one statement.
  async deactivateMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.db
      .from('currencies')
      .update({ active: false })
      .in('id', ids);
    if (error) this.handleError(error);
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

export default new CurrencyRepository()
