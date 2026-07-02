import type { BranchFilter } from '@/src/core/constants';
import type { DbPlan } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { insertDirty, updateDirty } from '@/src/core/offline/db/dml';
import { newId, nowIso } from '@/src/core/offline/ids';
import type { IPlanRepository } from './IPlanRepository';

/**
 * SQLite-backed Plan repository. Reads from the local mirror; writes mutate
 * the mirror AND enqueue an outbox op in one transaction, then kick a sync.
 * Returns the same `DbPlan` shapes as the Supabase repository.
 *
 * NOTE: `DbPlan` has no `updated_at` — the local `plans.updated_at` column
 * exists only for the pull merge and stays null on local writes.
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
    await this.write(async (db, queue) => {
      await insertDirty(db, 'plans', row);
      await queue({ tableName: 'plans', opType: 'insert', rowId: row.id, payload: { row } });
    });    return row;
  }

  async update(
    id: string,
    payload: Partial<
      Pick<DbPlan, 'name' | 'price' | 'is_custom_price' | 'duration_months' | 'currency_id' | 'branch_id'>
    >,
  ): Promise<DbPlan> {
    await this.write(async (db, queue) => {
      await updateDirty(db, 'plans', id, payload);
      await queue({ tableName: 'plans', opType: 'update', rowId: id, payload: { fields: payload } });
    });    const row = await this.first('SELECT * FROM plans WHERE id = ?', [id]);
    if (!row) this.handleError(new Error('Plan not found'));
    return this.decodeOne<DbPlan>('plans', row)!;
  }

  async delete(id: string): Promise<void> {
    await this.write(async (db, queue) => {
      await db.runAsync('DELETE FROM plans WHERE id = ?', [id] as never[]);
      await queue({ tableName: 'plans', opType: 'hard_delete', rowId: id, payload: {} });
    });  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.write(async (db, queue) => {
      for (const id of ids) {
        await db.runAsync('DELETE FROM plans WHERE id = ?', [id] as never[]);
        await queue({ tableName: 'plans', opType: 'hard_delete', rowId: id, payload: {} });
      }
    });  }

  async countAll(branchFilter: BranchFilter = null): Promise<number> {
    const where = this.combineWhere([
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.plans, 'plans'),
    ]);
    return this.count(`SELECT COUNT(*) AS n FROM plans ${where.sql}`, where.params);
  }
}
