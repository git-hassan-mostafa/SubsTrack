import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { DbBranch } from '@/src/core/types/db';

export class BranchRepository extends BaseRepository {
  async findAll(): Promise<DbBranch[]> {
    const { data, error } = await this.db
      .from('branches')
      .select('*')
      .order('active', { ascending: false })
      .order('name');
    if (error) this.handleError(error);
    return (data ?? []) as DbBranch[];
  }

  async create(
    payload: Omit<DbBranch, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<DbBranch> {
    const { data, error } = await this.db
      .from('branches')
      .insert(payload)
      .select()
      .single();
    if (error) this.handleError(error);
    return data as DbBranch;
  }

  async update(
    id: string,
    payload: Partial<Pick<DbBranch, 'name' | 'active'>>,
  ): Promise<DbBranch> {
    const { data, error } = await this.db
      .from('branches')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) this.handleError(error);
    return data as DbBranch;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('branches').delete().eq('id', id);
    if (error) this.handleError(error);
  }

  // Total references across users + customers + plans for this branch.
  // Used by BranchService to choose hard-delete vs soft-delete.
  async countReferences(id: string): Promise<number> {
    const [users, customers, plans] = await Promise.all([
      this.db.from('users').select('id', { count: 'exact', head: true }).eq('branch_id', id),
      this.db.from('customers').select('id', { count: 'exact', head: true }).eq('branch_id', id),
      this.db.from('plans').select('id', { count: 'exact', head: true }).eq('branch_id', id),
    ]);
    if (users.error) this.handleError(users.error);
    if (customers.error) this.handleError(customers.error);
    if (plans.error) this.handleError(plans.error);
    return (users.count ?? 0) + (customers.count ?? 0) + (plans.count ?? 0);
  }
}
