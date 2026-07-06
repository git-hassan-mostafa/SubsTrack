import type { BranchFilter } from '@/src/core/constants';
import type { DbPlan } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { insertDirty, updateDirty, markDeleted } from '@/src/core/offline/db/dml';
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
    await this.write((db) => insertDirty(db, 'plans', row));
    return row;
  }

  async update(
    id: string,
    payload: Partial<
      Pick<DbPlan, 'name' | 'price' | 'is_custom_price' | 'duration_months' | 'currency_id' | 'branch_id'>
    >,
  ): Promise<DbPlan> {
    await this.write((db) => updateDirty(db, 'plans', id, payload));
    const row = await this.first('SELECT * FROM plans WHERE id = ?', [id]);
    if (!row) this.handleError(new Error('Plan not found'));
    return this.decodeOne<DbPlan>('plans', row)!;
  }

  async delete(id: string): Promise<void> {
    await this.write(async (db) => {
      await db.runAsync('DELETE FROM plans WHERE id = ?', [id] as never[]);
      await markDeleted(db, 'plans', id);
    });
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.write(async (db) => {
      for (const id of ids) {
        await db.runAsync('DELETE FROM plans WHERE id = ?', [id] as never[]);
        await markDeleted(db, 'plans', id);
      }
    });
  }

  async countAll(branchFilter: BranchFilter = null): Promise<number> {
    const where = this.combineWhere([
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.plans, 'plans'),
    ]);
    return this.count(`SELECT COUNT(*) AS n FROM plans ${where.sql}`, where.params);
  }
}
