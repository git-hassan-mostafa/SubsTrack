import type { DbCurrency } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { insertDirty, updateDirty } from '@/src/core/offline/db/dml';
import { newId, nowIso } from '@/src/core/offline/ids';
import type { ICurrencyRepository } from './ICurrencyRepository';

/**
 * SQLite-backed Currency repository. Reads from the local mirror; writes mutate
 * the mirror AND enqueue an outbox op in one transaction (a background sync
 * pushes them on the next tick).
 * Returns the same `DbCurrency` shapes as the Supabase repository.
 */
export class OfflineCurrencyRepository extends OfflineBaseRepository implements ICurrencyRepository {
  async findAll(): Promise<DbCurrency[]> {
    const rows = await this.all('SELECT * FROM currencies ORDER BY active DESC, code ASC');
    return this.decodeAll<DbCurrency>('currencies', rows);
  }

  async create(payload: Omit<DbCurrency, 'id' | 'created_at' | 'updated_at'>): Promise<DbCurrency> {
    const now = nowIso();
    const row: DbCurrency = { id: newId(), created_at: now, updated_at: now, ...payload };
    await this.write(async (db, queue) => {
      await insertDirty(db, 'currencies', row);
      await queue({ tableName: 'currencies', opType: 'insert', rowId: row.id, payload: { row } });
    });    return row;
  }

  async update(
    id: string,
    payload: Partial<
      Pick<DbCurrency, 'code' | 'name' | 'symbol' | 'rate_per_usd' | 'decimals' | 'active'>
    >,
  ): Promise<DbCurrency> {
    await this.write(async (db, queue) => {
      await updateDirty(db, 'currencies', id, { ...payload, updated_at: nowIso() });
      await queue({ tableName: 'currencies', opType: 'update', rowId: id, payload: { fields: payload } });
    });    const row = await this.first('SELECT * FROM currencies WHERE id = ?', [id]);
    if (!row) this.handleError(new Error('Currency not found'));
    return this.decodeOne<DbCurrency>('currencies', row)!;
  }

  async delete(id: string): Promise<void> {
    await this.write(async (db, queue) => {
      await db.runAsync('DELETE FROM currencies WHERE id = ?', [id] as never[]);
      await queue({ tableName: 'currencies', opType: 'hard_delete', rowId: id, payload: {} });
    });  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.write(async (db, queue) => {
      for (const id of ids) {
        await db.runAsync('DELETE FROM currencies WHERE id = ?', [id] as never[]);
        await queue({ tableName: 'currencies', opType: 'hard_delete', rowId: id, payload: {} });
      }
    });  }

  async deactivateMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.write(async (db, queue) => {
      for (const id of ids) {
        await updateDirty(db, 'currencies', id, { active: false, updated_at: nowIso() });
        await queue({
          tableName: 'currencies',
          opType: 'soft_delete',
          rowId: id,
          payload: { fields: { active: false } },
        });
      }
    });  }

  async referencedIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const [plans, payments] = await Promise.all([
      this.referencedIdsIn('plans', 'currency_id', ids),
      this.referencedIdsIn('payments', 'currency_id', ids),
    ]);
    return new Set([...plans, ...payments]);
  }

  async countReferences(id: string): Promise<number> {
    const [plans, payments] = await Promise.all([
      this.count('SELECT COUNT(*) AS n FROM plans WHERE currency_id = ?', [id]),
      this.count('SELECT COUNT(*) AS n FROM payments WHERE currency_id = ?', [id]),
    ]);
    return plans + payments;
  }
}
