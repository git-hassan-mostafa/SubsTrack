import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { DbPlan } from '@/src/core/types/db';

export class PlanRepository extends BaseRepository {
  async findAll(): Promise<DbPlan[]> {
    const { data, error } = await this.db
      .from('plans')
      .select('*')
      .order('name');
    if (error) this.handleError(error);
    return (data ?? []) as DbPlan[];
  }

  async create(payload: Omit<DbPlan, 'id' | 'created_at'>): Promise<DbPlan> {
    const { data, error } = await this.db
      .from('plans')
      .insert(payload)
      .select()
      .single();
    if (error) this.handleError(error);
    return data as DbPlan;
  }

  async update(id: string, payload: Partial<Pick<DbPlan, 'name' | 'price' | 'is_custom_price' | 'duration_months'>>): Promise<DbPlan> {
    const { data, error } = await this.db
      .from('plans')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) this.handleError(error);
    return data as DbPlan;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('plans').delete().eq('id', id);
    if (error) this.handleError(error);
  }

  async countAll(): Promise<number> {
    const { count, error } = await this.db
      .from('plans')
      .select('id', { count: 'exact', head: true });
    if (error) this.handleError(error);
    return count ?? 0;
  }
}
