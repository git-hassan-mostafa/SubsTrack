import type { DbBranch } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { insertDirty, updateDirty } from '@/src/core/offline/db/dml';
import { newId, nowIso } from '@/src/core/offline/ids';
import { requestSync } from '@/src/core/offline/sync/engine';
import type { IBranchRepository } from './IBranchRepository';

/**
 * SQLite-backed Branch repository. Reads from the local mirror; writes mutate
 * the mirror AND enqueue an outbox op in one transaction, then kick a sync.
 * Returns the same `DbBranch` shapes as the Supabase repository.
 */
export class OfflineBranchRepository extends OfflineBaseRepository implements IBranchRepository {
  async findAll(): Promise<DbBranch[]> {
    const rows = await this.all('SELECT * FROM branches ORDER BY active DESC, name ASC');
    return this.decodeAll<DbBranch>('branches', rows);
  }

  async create(payload: Omit<DbBranch, 'id' | 'created_at' | 'updated_at'>): Promise<DbBranch> {
    const now = nowIso();
    const row: DbBranch = { id: newId(), created_at: now, updated_at: now, ...payload };
    await this.write(async (db, queue) => {
      await insertDirty(db, 'branches', row);
      await queue({ tableName: 'branches', opType: 'insert', rowId: row.id, payload: { row } });
    });
    requestSync();
    return row;
  }

  async update(id: string, payload: Partial<Pick<DbBranch, 'name' | 'active'>>): Promise<DbBranch> {
    await this.write(async (db, queue) => {
      await updateDirty(db, 'branches', id, { ...payload, updated_at: nowIso() });
      await queue({ tableName: 'branches', opType: 'update', rowId: id, payload: { fields: payload } });
    });
    requestSync();
    const row = await this.first('SELECT * FROM branches WHERE id = ?', [id]);
    if (!row) this.handleError(new Error('Branch not found'));
    return this.decodeOne<DbBranch>('branches', row)!;
  }

  async delete(id: string): Promise<void> {
    await this.write(async (db, queue) => {
      await db.runAsync('DELETE FROM branches WHERE id = ?', [id] as never[]);
      await queue({ tableName: 'branches', opType: 'hard_delete', rowId: id, payload: {} });
    });
    requestSync();
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.write(async (db, queue) => {
      for (const id of ids) {
        await db.runAsync('DELETE FROM branches WHERE id = ?', [id] as never[]);
        await queue({ tableName: 'branches', opType: 'hard_delete', rowId: id, payload: {} });
      }
    });
    requestSync();
  }

  async deactivateMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.write(async (db, queue) => {
      for (const id of ids) {
        await updateDirty(db, 'branches', id, { active: false, updated_at: nowIso() });
        await queue({
          tableName: 'branches',
          opType: 'soft_delete',
          rowId: id,
          payload: { fields: { active: false } },
        });
      }
    });
    requestSync();
  }

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
    return this.count('SELECT COUNT(*) AS n FROM branches WHERE active = 1');
  }

  async countActiveAmong(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const ph = ids.map(() => '?').join(', ');
    return this.count(`SELECT COUNT(*) AS n FROM branches WHERE active = 1 AND id IN (${ph})`, ids);
  }

  async countReferences(id: string): Promise<number> {
    const [users, customers, plans] = await Promise.all([
      this.count('SELECT COUNT(*) AS n FROM users WHERE branch_id = ?', [id]),
      this.count('SELECT COUNT(*) AS n FROM customers WHERE branch_id = ?', [id]),
      this.count('SELECT COUNT(*) AS n FROM plans WHERE branch_id = ?', [id]),
    ]);
    return users + customers + plans;
  }
}
