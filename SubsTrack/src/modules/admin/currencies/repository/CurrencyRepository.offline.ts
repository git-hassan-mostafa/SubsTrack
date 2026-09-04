import type { DbCurrency } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { insertDirty } from '@/src/core/offline/db/dml';
import { newId, nowIso } from '@/src/core/offline/ids';
import type { ICurrencyRepository } from './ICurrencyRepository';

/**
 * SQLite-backed Currency repository. Reads from the local mirror; writes mutate
 * the mirror and flag the row `_dirty` (hard deletes are logged in
 * `pending_deletes`) so the next sync pushes them. Returns the same `DbCurrency`
 * shapes as the Supabase repository.
 */
export class OfflineCurrencyRepository extends OfflineBaseRepository implements ICurrencyRepository {
  async findAll(): Promise<DbCurrency[]> {
    const rows = await this.all('SELECT * FROM currencies ORDER BY active DESC, code ASC');
    return this.decodeAll<DbCurrency>('currencies', rows);
  }

  async create(payload: Omit<DbCurrency, 'id' | 'created_at' | 'updated_at'>): Promise<DbCurrency> {
    const now = nowIso();
    const row: DbCurrency = { id: newId(), created_at: now, updated_at: now, ...payload };
    await this.write(async (db) => {
      await insertDirty(db, 'currencies', row);
      await this.auditIn(db, {
        table: 'currencies',
        recordId: row.id,
        action: 'create',
        after: row,
      });
    });
    return row;
  }

  async update(
    id: string,
    payload: Partial<
      Pick<DbCurrency, 'code' | 'name' | 'symbol' | 'rate_per_usd' | 'decimals' | 'active'>
    >,
  ): Promise<DbCurrency> {
    const row = await this.auditedUpdate<DbCurrency>(
      'currencies',
      id,
      { ...payload, updated_at: nowIso() },
      { action: payload.active === true ? 'restore' : 'update', branchColumn: null },
    );
    if (!row) this.handleError(new Error('Currency not found'));
    return row;
  }

  async delete(id: string): Promise<void> {
    await this.deleteMany([id]);
  }

  async deleteMany(ids: string[]): Promise<void> {
    await this.auditedDelete<DbCurrency>('currencies', ids, { branchColumn: null });
  }

  async deactivateMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    for (const id of ids) {
      await this.auditedUpdate<DbCurrency>(
        'currencies',
        id,
        { active: false, updated_at: nowIso() },
        { branchColumn: null },
      );
    }
  }

  async referencedIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const [plans, charges, collections, lines] = await Promise.all([
      this.referencedIdsIn('plans', 'currency_id', ids),
      this.referencedIdsIn('charges', 'currency_id', ids),
      this.referencedIdsIn('collections', 'currency_id', ids),
      this.referencedIdsIn('customer_plans', 'custom_currency_id', ids),
    ]);
    return new Set([...plans, ...charges, ...collections, ...lines]);
  }

  async countReferences(id: string): Promise<number> {
    const [plans, charges, collections, lines] = await Promise.all([
      this.count('SELECT COUNT(*) AS n FROM plans WHERE currency_id = ?', [id]),
      this.count('SELECT COUNT(*) AS n FROM charges WHERE currency_id = ?', [id]),
      this.count('SELECT COUNT(*) AS n FROM collections WHERE currency_id = ?', [id]),
      this.count('SELECT COUNT(*) AS n FROM customer_plans WHERE custom_currency_id = ?', [id]),
    ]);
    return plans + charges + collections + lines;
  }
}
