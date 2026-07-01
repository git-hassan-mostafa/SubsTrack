import type { BranchFilter } from '@/src/core/constants';
import type { DbProduct } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { insertDirty, updateDirty } from '@/src/core/offline/db/dml';
import { newId, nowIso } from '@/src/core/offline/ids';
import { requestSync } from '@/src/core/offline/sync/engine';
import type { IProductRepository } from './IProductRepository';

/**
 * SQLite-backed Product repository. Reads from the local mirror; writes mutate
 * the mirror AND enqueue an outbox op in one transaction, then kick a sync.
 * Returns the same `DbProduct` shapes as the Supabase repository.
 */
export class OfflineProductRepository extends OfflineBaseRepository implements IProductRepository {
  async findAll(branchFilter: BranchFilter = null): Promise<DbProduct[]> {
    const where = this.combineWhere([
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.products, 'products'),
    ]);
    const rows = await this.all(
      `SELECT * FROM products ${where.sql} ORDER BY active DESC, name`,
      where.params,
    );
    return this.decodeAll<DbProduct>('products', rows);
  }

  async create(payload: Omit<DbProduct, 'id' | 'created_at' | 'updated_at'>): Promise<DbProduct> {
    const now = nowIso();
    const row: DbProduct = { id: newId(), created_at: now, updated_at: now, ...payload };
    await this.write(async (db, queue) => {
      await insertDirty(db, 'products', row);
      await queue({ tableName: 'products', opType: 'insert', rowId: row.id, payload: { row } });
    });
    requestSync();
    return row;
  }

  async update(
    id: string,
    payload: Partial<
      Pick<DbProduct, 'name' | 'description' | 'price' | 'currency_id' | 'branch_id' | 'active'>
    >,
  ): Promise<DbProduct> {
    await this.write(async (db, queue) => {
      await updateDirty(db, 'products', id, { ...payload, updated_at: nowIso() });
      await queue({ tableName: 'products', opType: 'update', rowId: id, payload: { fields: payload } });
    });
    requestSync();
    const row = await this.first('SELECT * FROM products WHERE id = ?', [id]);
    if (!row) this.handleError(new Error('Product not found'));
    return this.decodeOne<DbProduct>('products', row)!;
  }

  async delete(id: string): Promise<void> {
    await this.write(async (db, queue) => {
      await db.runAsync('DELETE FROM products WHERE id = ?', [id] as never[]);
      await queue({ tableName: 'products', opType: 'hard_delete', rowId: id, payload: {} });
    });
    requestSync();
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.write(async (db, queue) => {
      for (const id of ids) {
        await db.runAsync('DELETE FROM products WHERE id = ?', [id] as never[]);
        await queue({ tableName: 'products', opType: 'hard_delete', rowId: id, payload: {} });
      }
    });
    requestSync();
  }

  async deactivateMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.write(async (db, queue) => {
      for (const id of ids) {
        await updateDirty(db, 'products', id, { active: false, updated_at: nowIso() });
        await queue({
          tableName: 'products',
          opType: 'soft_delete',
          rowId: id,
          payload: { fields: { active: false } },
        });
      }
    });
    requestSync();
  }

  async referencedIds(ids: string[]): Promise<Set<string>> {
    return this.referencedIdsIn('sales', 'product_id', ids);
  }

  async countAll(branchFilter: BranchFilter = null): Promise<number> {
    const where = this.combineWhere([
      { clause: 'products.active = 1', params: [] },
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.products, 'products'),
    ]);
    return this.count(`SELECT COUNT(*) AS n FROM products ${where.sql}`, where.params);
  }

  async countReferences(id: string): Promise<number> {
    return this.count('SELECT COUNT(*) AS n FROM sales WHERE product_id = ?', [id]);
  }
}
