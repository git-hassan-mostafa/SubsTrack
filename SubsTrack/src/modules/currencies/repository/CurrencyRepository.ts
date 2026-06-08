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
