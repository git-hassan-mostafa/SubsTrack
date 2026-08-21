import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { BranchFilter } from '@/src/core/constants';
import type { DbService } from '@/src/core/types/db';
import type { IServiceRepository } from './IServiceRepository';
import { OfflineServiceRepository } from './ServiceRepository.offline';

export class ServiceRepository extends BaseRepository implements IServiceRepository {
  async findAll(branchFilter: BranchFilter = null): Promise<DbService[]> {
    let query = this.db
      .from('services')
      .select('*')
      .order('active', { ascending: false })
      .order('name');
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.services);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []) as DbService[];
  }

  async create(
    payload: Omit<DbService, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<DbService> {
    const { data, error } = await this.db
      .from('services')
      .insert(payload)
      .select()
      .single();
    if (error) this.handleError(error);
    const created = data as DbService;
    this.audit({
      table: 'services',
      recordId: created.id,
      action: 'create',
      after: created,
      branchId: created.branch_id,
    });
    return created;
  }

  async update(
    id: string,
    payload: Partial<
      Pick<DbService, 'name' | 'description' | 'price' | 'currency_id' | 'branch_id' | 'active'>
    >,
  ): Promise<DbService> {
    return this.auditedUpdate<DbService>('services', id, payload, {
      action: payload.active === true ? 'restore' : 'update',
    });
  }

  async delete(id: string): Promise<void> {
    await this.deleteMany([id]);
  }

  async deleteMany(ids: string[]): Promise<void> {
    await this.auditedDelete<DbService>('services', ids);
  }

  async deactivateMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    for (const id of ids) {
      await this.auditedUpdate<DbService>('services', id, { active: false });
    }
  }

  async referencedIds(ids: string[]): Promise<Set<string>> {
    return this.referencedIdsIn('sale_items', 'service_id', ids);
  }

  // Active services only, mirroring products — a soft-deleted one is history.
  async countAll(branchFilter: BranchFilter = null): Promise<number> {
    let query = this.db
      .from('services')
      .select('id', { count: 'exact', head: true })
      .eq('active', true);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.services);
    const { count, error } = await query;
    if (error) this.handleError(error);
    return count ?? 0;
  }

  async countReferences(id: string): Promise<number> {
    const { count, error } = await this.db
      .from('sale_items')
      .select('id', { count: 'exact', head: true })
      .eq('service_id', id);
    if (error) this.handleError(error);
    return count ?? 0;
  }
}

// Platform seam: web talks to Supabase directly; native uses the offline SQLite
// repository. Callers import this default, so nothing above the repo layer knows.
const impl: IServiceRepository =
  Platform.OS === 'web' ? new ServiceRepository() : new OfflineServiceRepository();

export default impl;
