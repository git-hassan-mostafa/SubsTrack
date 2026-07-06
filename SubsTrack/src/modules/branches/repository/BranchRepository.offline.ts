import type { DbBranch } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { insertDirty, updateDirty, markDeleted } from '@/src/core/offline/db/dml';
import { newId, nowIso } from '@/src/core/offline/ids';
import type { IBranchRepository } from './IBranchRepository';

/**
 * SQLite-backed Branch repository. Reads from the local mirror; writes mutate
 * the mirror and flag the row `_dirty` (hard deletes are logged in
 * `pending_deletes`) so the next sync pushes them. Returns the same `DbBranch`
 * shapes as the Supabase repository.
 */
export class OfflineBranchRepository extends OfflineBaseRepository implements IBranchRepository {
  async findAll(): Promise<DbBranch[]> {
    const rows = await this.all('SELECT * FROM branches ORDER BY active DESC, name ASC');
    return this.decodeAll<DbBranch>('branches', rows);
  }

  async create(payload: Omit<DbBranch, 'id' | 'created_at' | 'updated_at'>): Promise<DbBranch> {
    const now = nowIso();
    const row: DbBranch = { id: newId(), created_at: now, updated_at: now, ...payload };
    await this.write((db) => insertDirty(db, 'branches', row));
    return row;
  }

  async update(id: string, payload: Partial<Pick<DbBranch, 'name' | 'active'>>): Promise<DbBranch> {
    await this.write((db) => updateDirty(db, 'branches', id, { ...payload, updated_at: nowIso() }));
    const row = await this.first('SELECT * FROM branches WHERE id = ?', [id]);
    if (!row) this.handleError(new Error('Branch not found'));
    return this.decodeOne<DbBranch>('branches', row)!;
  }

  async delete(id: string): Promise<void> {
    await this.write(async (db) => {
      await db.runAsync('DELETE FROM branches WHERE id = ?', [id] as never[]);
      await markDeleted(db, 'branches', id);
    });
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.write(async (db) => {
      for (const id of ids) {
        await db.runAsync('DELETE FROM branches WHERE id = ?', [id] as never[]);
        await markDeleted(db, 'branches', id);
      }
    });
  }

  async deactivateMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.write(async (db) => {
      for (const id of ids) {
        await updateDirty(db, 'branches', id, { active: false, updated_at: nowIso() });
      }
    });
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
