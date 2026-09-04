import type { Branch, TierPlan, TenantUsage } from '@/src/core/types';
import i18n from '@/src/core/i18n';
import repository from '../repository/BranchRepository';
import { tierService } from '@/src/modules/admin/subscription';
import { mapDbBranchToBranch } from '../utils/mapper';
import { BranchInput } from '../utils/types';


class BranchService {
  async getBranches(): Promise<Branch[]> {
    const rows = await repository.findAll();
    return rows.map(mapDbBranchToBranch);
  }

  async createBranch(
    data: BranchInput,
    tenantId: string,
    tier: TierPlan,
    usage: TenantUsage,
  ): Promise<Branch> {
    const normalized = this.validate(data);
    tierService.assertCanCreate(tier, usage, 'branches');
    try {
      const row = await repository.create({
        tenant_id: tenantId,
        name: normalized.name,
        active: true,
      });
      return mapDbBranchToBranch(row);
    } catch (err) {
      return this.rethrow(err);
    }
  }

  async updateBranch(id: string, data: BranchInput): Promise<Branch> {
    const normalized = this.validate(data);
    try {
      const row = await repository.update(id, { name: normalized.name });
      return mapDbBranchToBranch(row);
    } catch (err) {
      return this.rethrow(err);
    }
  }

  async deleteBranch(id: string): Promise<'hard' | 'soft'> {
    const activeCount = await repository.countActive();
    if (activeCount <= 1) {
      throw new Error(i18n.t('errors.branch_last_active'));
    }
    const refs = await repository.countReferences(id);
    if (refs > 0) {
      await repository.update(id, { active: false });
      return 'soft';
    }
    await repository.delete(id);
    return 'hard';
  }

  async reactivateBranch(id: string): Promise<Branch> {
    const row = await repository.update(id, { active: true });
    return mapDbBranchToBranch(row);
  }

  async deleteManyBranches(
    ids: string[],
  ): Promise<{ hard: string[]; soft: string[] }> {
    if (ids.length === 0) return { hard: [], soft: [] };
    const [activeCount, activeSelected] = await Promise.all([
      repository.countActive(),
      repository.countActiveAmong(ids),
    ]);
    if (activeCount - activeSelected < 1) {
      throw new Error(i18n.t('errors.branch_last_active'));
    }
    const referenced = await repository.referencedIds(ids);
    const soft = ids.filter((id) => referenced.has(id));
    const hard = ids.filter((id) => !referenced.has(id));
    await Promise.all([
      repository.deactivateMany(soft),
      repository.deleteMany(hard),
    ]);
    return { hard, soft };
  }

  private validate(data: BranchInput): BranchInput {
    const name = (data.name ?? '').trim();
    if (!name) throw new Error(i18n.t('errors.branch_name_required'));
    if (name.length > 60) throw new Error(i18n.t('errors.branch_name_too_long'));
    return { name };
  }

  private rethrow(err: unknown): never {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('uq_branches_name_tenant') || msg.includes('duplicate')) {
      throw new Error(i18n.t('errors.branch_name_exists'));
    }
    throw err instanceof Error ? err : new Error(i18n.t('errors.connection_error'));
  }
}

export default new BranchService()
