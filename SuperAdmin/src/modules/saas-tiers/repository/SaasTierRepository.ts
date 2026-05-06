import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { DbSaasTier } from '@/src/core/types/db';

export class SaasTierRepository extends BaseRepository {
  async findAll(): Promise<DbSaasTier[]> {
    const { data, error } = await this.db
      .from('saas_tiers')
      .select('*')
      .order('created_at');
    if (error) this.handleError(error);
    return (data ?? []) as DbSaasTier[];
  }

  async create(payload: Omit<DbSaasTier, 'id' | 'created_at'>): Promise<DbSaasTier> {
    const { data, error } = await this.db
      .from('saas_tiers')
      .insert(payload)
      .select()
      .single();
    if (error) this.handleError(error);
    return data as DbSaasTier;
  }

  async update(
    id: string,
    payload: Partial<Pick<DbSaasTier, 'name' | 'max_users' | 'max_customers' | 'price' | 'grace_days'>>,
  ): Promise<DbSaasTier> {
    const { data, error } = await this.db
      .from('saas_tiers')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) this.handleError(error);
    return data as DbSaasTier;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('saas_tiers').delete().eq('id', id);
    if (error) this.handleError(error);
  }
}
