import type { DbSkippedMonth } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { upsertNaturalKeyDirty } from '@/src/core/offline/db/dml';
import { deterministicId, nowIso } from '@/src/core/offline/ids';
import type { ISkippedMonthRepository, SkippedMonthPayload } from './ISkippedMonthRepository';

/**
 * SQLite-backed skipped months. Writes upsert on the natural key
 * (customer_plan_id, billing_month) with a DETERMINISTIC id derived from it, so
 * two devices skipping the same month converge on push instead of colliding.
 * The 'skip' prefix keeps those ids distinct from the payment ids built on the
 * same pair.
 */
export class OfflineSkippedMonthRepository
  extends OfflineBaseRepository
  implements ISkippedMonthRepository
{
  async findActiveByCustomer(customerId: string): Promise<DbSkippedMonth[]> {
    const rows = await this.all(
      'SELECT * FROM skipped_months WHERE customer_id = ? AND skipped = 1 ORDER BY billing_month',
      [customerId],
    );
    return this.decodeAll<DbSkippedMonth>('skipped_months', rows);
  }

  async findActive(): Promise<DbSkippedMonth[]> {
    const rows = await this.all('SELECT * FROM skipped_months WHERE skipped = 1');
    return this.decodeAll<DbSkippedMonth>('skipped_months', rows);
  }

  async upsertMany(payloads: SkippedMonthPayload[]): Promise<DbSkippedMonth[]> {
    if (payloads.length === 0) return [];
    const now = nowIso();
    const rows: DbSkippedMonth[] = [];
    for (const p of payloads) {
      rows.push({
        ...p,
        id: await deterministicId('skip', p.customer_plan_id, p.billing_month),
        created_at: now,
        updated_at: now,
      });
    }
    // The mirror may already hold this line+month under another id (created on
    // the web or another device) — echo back the id it actually stored.
    const storedIds = await this.write(async (db) => {
      const ids: string[] = [];
      for (const row of rows) ids.push(await upsertNaturalKeyDirty(db, 'skipped_months', row));
      return ids;
    });
    return rows.map((row, i) => ({ ...row, id: storedIds[i] }));
  }
}
