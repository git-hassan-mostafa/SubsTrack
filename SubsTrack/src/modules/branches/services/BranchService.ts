import type { Branch } from '@/src/core/types';
import type { DbBranch } from '@/src/core/types/db';
import { BranchRepository } from '../repository/BranchRepository';

export function mapDbBranchToBranch(db: DbBranch): Branch {
  return {
    id: db.id,
    tenantId: db.tenant_id,
    name: db.name,
    active: db.active,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

export type BranchInput = {
  name: string;
};

export class BranchService {
  private repository = new BranchRepository();

  async getBranches(): Promise<Branch[]> {
    const rows = await this.repository.findAll();
    return rows.map(mapDbBranchToBranch);
  }

  async createBranch(data: BranchInput, tenantId: string): Promise<Branch> {
    const normalized = this.validate(data);
    try {
      const row = await this.repository.create({
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
      const row = await this.repository.update(id, { name: normalized.name });
      return mapDbBranchToBranch(row);
    } catch (err) {
      return this.rethrow(err);
    }
  }

  // Soft-delete if the branch is referenced; hard-delete otherwise.
  // Returns the mode so the UI can communicate the outcome.
  async deleteBranch(id: string): Promise<'hard' | 'soft'> {
    const activeCount = await this.repository.countActive();
    if (activeCount <= 1) {
      throw new Error('Cannot delete the only active branch. Add another branch first.');
    }
    const refs = await this.repository.countReferences(id);
    if (refs > 0) {
      await this.repository.update(id, { active: false });
      return 'soft';
    }
    await this.repository.delete(id);
    return 'hard';
  }

  async reactivateBranch(id: string): Promise<Branch> {
    const row = await this.repository.update(id, { active: true });
    return mapDbBranchToBranch(row);
  }

  private validate(data: BranchInput): BranchInput {
    const name = (data.name ?? '').trim();
    if (!name) throw new Error('Branch name is required');
    if (name.length > 60) throw new Error('Branch name is too long');
    return { name };
  }

  private rethrow(err: unknown): never {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('uq_branches_name_tenant') || msg.includes('duplicate')) {
      throw new Error('A branch with this name already exists');
    }
    throw err instanceof Error ? err : new Error('Connection error. Please try again.');
  }
}
