import type { BranchFilter } from '@/src/core/constants';
import type { DbPlan } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { insertDirty } from '@/src/core/offline/db/dml';
import { newId, nowIso } from '@/src/core/offline/ids';
import type { IPlanRepository } from './IPlanRepository';

/**
 * SQLite-backed Plan repository. Reads from the local mirror; writes mutate the
 * mirror and flag the row `_dirty` (hard deletes are logged in `pending_deletes`)
 * so the next sync pushes them. Returns the same `DbPlan` shapes as the Supabase
 * repository.
 *
 * NOTE: `DbPlan` has no `updated_at` — the local `plans.updated_at` column exists
 * only for the pull merge and stays null on local writes (push omits it anyway).
 */
export class OfflinePlanRepository extends OfflineBaseRepository implements IPlanRepository {
  async findAll(branchFilter: BranchFilter = null): Promise<DbPlan[]> {
    const where = this.combineWhere([
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.plans, 'plans'),
    ]);
    const rows = await this.all(
      `SELECT * FROM plans ${where.sql} ORDER BY name`,
      where.params,
    );
    return this.decodeAll<DbPlan>('plans', rows);
  }

  async create(payload: Omit<DbPlan, 'id' | 'created_at'>): Promise<DbPlan> {
    const row: DbPlan = { id: newId(), created_at: nowIso(), ...payload };
    await this.write(async (db) => {
      await insertDirty(db, 'plans', row);
      await this.auditIn(db, {
        table: 'plans',
        recordId: row.id,
        action: 'create',
        after: row,
        branchId: row.branch_id,
      });
    });
    return row;
  }

  async update(
    id: string,
    payload: Partial<
      Pick<DbPlan, 'name' | 'price' | 'is_custom_price' | 'duration_months' | 'currency_id' | 'branch_id'>
    >,
  ): Promise<DbPlan> {
    const row = await this.auditedUpdate<DbPlan>('plans', id, payload);
    if (!row) this.handleError(new Error('Plan not found'));
    return row;
  }

  async delete(id: string): Promise<void> {
    await this.deleteMany([id]);
  }

  async deleteMany(ids: string[]): Promise<void> {
    await this.auditedDelete<DbPlan>('plans', ids);
  }

  async countAll(branchFilter: BranchFilter = null): Promise<number> {
    const where = this.combineWhere([
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.plans, 'plans'),
    ]);
    return this.count(`SELECT COUNT(*) AS n FROM plans ${where.sql}`, where.params);
  }
}
