import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { DbBranch } from '@/src/core/types/db';
import type { IBranchRepository } from './IBranchRepository';
import { OfflineBranchRepository } from './BranchRepository.offline';

export class BranchRepository extends BaseRepository implements IBranchRepository {
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

  // Hard-delete many branches in one statement. Referencing users/customers/plans
  // fall back to "unassigned"/"shared" via their ON DELETE SET NULL constraints.
  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.db.from('branches').delete().in('id', ids);
    if (error) this.handleError(error);
  }

  // Soft-delete many branches in one statement.
  async deactivateMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.db
      .from('branches')
      .update({ active: false })
      .in('id', ids);
    if (error) this.handleError(error);
  }

  // The subset of the given branches referenced by any user, customer, or plan.
  async referencedIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const [users, customers, plans] = await Promise.all([
      this.referencedIdsIn('users', 'branch_id', ids),
      this.referencedIdsIn('customers', 'branch_id', ids),
      this.referencedIdsIn('plans', 'branch_id', ids),
    ]);
    return new Set([...users, ...customers, ...plans]);
  }

  async countActive(): Promise<number> {
    const { count, error } = await this.db
      .from('branches')
      .select('id', { count: 'exact', head: true })
      .eq('active', true);
    if (error) this.handleError(error);
    return count ?? 0;
  }

  // How many of the given branches are currently active — used by the bulk
  // delete guard to ensure at least one active branch survives.
  async countActiveAmong(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const { count, error } = await this.db
      .from('branches')
      .select('id', { count: 'exact', head: true })
      .eq('active', true)
      .in('id', ids);
    if (error) this.handleError(error);
    return count ?? 0;
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

// Platform seam: web talks to Supabase directly (unchanged); native uses the
// offline SQLite repository. Services import this default, so neither services
// nor slices change. The offline class is only constructed on native, so web
// never opens a local DB.
const impl: IBranchRepository =
  Platform.OS === 'web' ? new BranchRepository() : new OfflineBranchRepository();

export default impl;
