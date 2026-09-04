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
    const owners = new Map<string, { branchId: string | null; subject: string | null }>();
    for (const p of payloads) {
      if (!owners.has(p.customer_id)) owners.set(p.customer_id, await this.customerAudit(p.customer_id));
    }
    const storedIds = await this.write(async (db) => {
      const ids: string[] = [];
      for (const row of rows) {
        const stored = await upsertNaturalKeyDirty(db, 'skipped_months', row);
        ids.push(stored);
        await this.auditIn(db, {
          table: 'skipped_months',
          recordId: stored,
          action: row.skipped ? 'create' : 'restore',
          after: { ...row, id: stored },
          ...owners.get(row.customer_id),
        });
      }
      return ids;
    });
    return rows.map((row, i) => ({ ...row, id: storedIds[i] }));
  }
}
