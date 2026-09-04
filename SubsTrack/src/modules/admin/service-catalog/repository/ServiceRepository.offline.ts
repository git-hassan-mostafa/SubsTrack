import type { BranchFilter } from '@/src/core/constants';
import type { DbService } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { insertDirty, markDeleted } from '@/src/core/offline/db/dml';
import { newId, nowIso } from '@/src/core/offline/ids';
import type { IServiceRepository } from './IServiceRepository';

/**
 * SQLite-backed Service repository. Reads from the local mirror; writes mutate
 * the mirror and flag the row `_dirty` (hard deletes are logged in
 * `pending_deletes`) so the next sync pushes them. Returns the same `DbService`
 * shapes as the Supabase repository.
 */
export class OfflineServiceRepository
  extends OfflineBaseRepository
  implements IServiceRepository
{
  async findAll(branchFilter: BranchFilter = null): Promise<DbService[]> {
    const where = this.combineWhere([
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.services, 'services'),
    ]);
    const rows = await this.all(
      `SELECT * FROM services ${where.sql} ORDER BY active DESC, name`,
      where.params,
    );
    return this.decodeAll<DbService>('services', rows);
  }

  async create(payload: Omit<DbService, 'id' | 'created_at' | 'updated_at'>): Promise<DbService> {
    const now = nowIso();
    const row: DbService = { id: newId(), created_at: now, updated_at: now, ...payload };
    await this.write(async (db) => {
      await insertDirty(db, 'services', row);
      await this.auditIn(db, {
        table: 'services',
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
      Pick<DbService, 'name' | 'description' | 'price' | 'currency_id' | 'branch_id' | 'active'>
    >,
  ): Promise<DbService> {
    const row = await this.auditedUpdate<DbService>(
      'services',
      id,
      { ...payload, updated_at: nowIso() },
      { action: payload.active === true ? 'restore' : 'update' },
    );
    if (!row) this.handleError(new Error('Service not found'));
    return row;
  }

  async delete(id: string): Promise<void> {
    await this.deleteMany([id]);
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.write(async (db) => {
      for (const id of ids) {
        const before = this.decodeOne<DbService>(
          'services',
          await this.first('SELECT * FROM services WHERE id = ?', [id]),
        );
        await db.runAsync('DELETE FROM services WHERE id = ?', [id] as never[]);
        await markDeleted(db, 'services', id);
        if (before) {
          await this.auditIn(db, {
            table: 'services',
            recordId: id,
            action: 'delete',
            before,
            branchId: before.branch_id,
          });
        }
      }
    });
  }

  async deactivateMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    for (const id of ids) {
      await this.auditedUpdate<DbService>('services', id, {
        active: false,
        updated_at: nowIso(),
      });
    }
  }

  async referencedIds(ids: string[]): Promise<Set<string>> {
    return this.referencedIdsIn('sale_items', 'service_id', ids);
  }

  async countAll(branchFilter: BranchFilter = null): Promise<number> {
    const where = this.combineWhere([
      { clause: 'services.active = 1', params: [] },
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.services, 'services'),
    ]);
    return this.count(`SELECT COUNT(*) AS n FROM services ${where.sql}`, where.params);
  }

  async countReferences(id: string): Promise<number> {
    return this.count('SELECT COUNT(*) AS n FROM sale_items WHERE service_id = ?', [id]);
  }
}
