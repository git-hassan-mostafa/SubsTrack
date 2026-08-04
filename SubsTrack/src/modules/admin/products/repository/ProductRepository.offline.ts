import type { SQLiteDatabase } from 'expo-sqlite';
import type { BranchFilter } from '@/src/core/constants';
import type { DbProduct, DbStockMovement } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { insertDirty, updateDirty, markDeleted } from '@/src/core/offline/db/dml';
import { newId, nowIso } from '@/src/core/offline/ids';
import type { CreateStockMovementPayload, IProductRepository } from './IProductRepository';

/**
 * SQLite-backed Product repository. Reads from the local mirror; writes mutate
 * the mirror and flag the row `_dirty` (hard deletes are logged in
 * `pending_deletes`) so the next sync pushes them. Returns the same `DbProduct`
 * shapes as the Supabase repository.
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
    await this.write(async (db) => {
      await insertDirty(db, 'products', row);
      await this.auditIn(db, {
        table: 'products',
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
      Pick<DbProduct, 'name' | 'description' | 'price' | 'currency_id' | 'branch_id' | 'active'>
    >,
  ): Promise<DbProduct> {
    const row = await this.auditedUpdate<DbProduct>(
      'products',
      id,
      { ...payload, updated_at: nowIso() },
      { action: payload.active === true ? 'restore' : 'update' },
    );
    if (!row) this.handleError(new Error('Product not found'));
    return row;
  }

  async delete(id: string): Promise<void> {
    await this.deleteMany([id]);
  }

  // Not auditedDelete: a product's own cascade (stock_movements) has to run in
  // the same transaction, which the generic helper doesn't know about.
  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.write(async (db) => {
      for (const id of ids) {
        const before = this.decodeOne<DbProduct>(
          'products',
          await this.first('SELECT * FROM products WHERE id = ?', [id]),
        );
        await this.deleteProductRow(db, id);
        await markDeleted(db, 'products', id);
        if (before) {
          await this.auditIn(db, {
            table: 'products',
            recordId: id,
            action: 'delete',
            before,
            branchId: before.branch_id,
          });
        }
      }
    });
  }

  // The server FK cascades stock_movements, but the mirror declares no FKs — so
  // cascade by hand. A leftover dirty movement pointing at a product the server
  // never saw would fail its push forever, and the push upserts a table's dirty
  // rows as one batch, taking every other movement down with it. No
  // markDeleted for the children: the server-side cascade covers them.
  private async deleteProductRow(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync('DELETE FROM stock_movements WHERE product_id = ?', [id] as never[]);
    await db.runAsync('DELETE FROM products WHERE id = ?', [id] as never[]);
  }

  async deactivateMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    for (const id of ids) {
      await this.auditedUpdate<DbProduct>('products', id, {
        active: false,
        updated_at: nowIso(),
      });
    }
  }

  async referencedIds(ids: string[]): Promise<Set<string>> {
    return this.referencedIdsIn('sale_items', 'product_id', ids);
  }

  async countAll(branchFilter: BranchFilter = null): Promise<number> {
    const where = this.combineWhere([
      { clause: 'products.active = 1', params: [] },
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.products, 'products'),
    ]);
    return this.count(`SELECT COUNT(*) AS n FROM products ${where.sql}`, where.params);
  }

  async countReferences(id: string): Promise<number> {
    return this.count('SELECT COUNT(*) AS n FROM sale_items WHERE product_id = ?', [id]);
  }

  // Local twin of the `product_stock` view — the mirror has no views, so the
  // aggregate runs here. quantity_delta is a real INTEGER column, so SUM() is
  // exact and needs no CAST (unlike the money columns stored as TEXT).
  async stockOnHand(productIds?: string[]): Promise<Record<string, number>> {
    if (productIds && productIds.length === 0) return {};
    const idFilter = productIds
      ? ` AND product_id IN (${productIds.map(() => '?').join(', ')})`
      : '';
    const rows = await this.all<{ product_id: string; on_hand: number }>(
      `SELECT product_id, SUM(quantity_delta) AS on_hand FROM stock_movements
       WHERE voided_at IS NULL${idFilter} GROUP BY product_id`,
      productIds ?? [],
    );
    const totals: Record<string, number> = {};
    for (const r of rows) totals[r.product_id] = Number(r.on_hand);
    return totals;
  }

  async addMovements(payloads: CreateStockMovementPayload[]): Promise<void> {
    if (payloads.length === 0) return;
    const now = nowIso();
    const rows: DbStockMovement[] = payloads.map((p) => ({
      ...p,
      id: newId(),
      voided_at: null,
      voided_by: null,
      created_at: now,
      updated_at: now,
    }));
    await this.write(async (db) => {
      for (const row of rows) await insertDirty(db, 'stock_movements', row);
    });
  }

  async movementsForProduct(productId: string, limit = 20): Promise<DbStockMovement[]> {
    const rows = await this.all(
      'SELECT * FROM stock_movements WHERE product_id = ? ORDER BY occurred_at DESC LIMIT ?',
      [productId, limit],
    );
    return this.decodeAll<DbStockMovement>('stock_movements', rows);
  }
}
