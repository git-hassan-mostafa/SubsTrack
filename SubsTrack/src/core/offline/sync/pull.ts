import { supabase } from '@/src/shared/lib/supabase';
import { getDb } from '../db/sqlite';
import { upsertFromServer } from '../db/dml';
import { hasPendingForRow } from '../outbox/outbox';
import { SYNC_PULL_ORDER } from '../db/tables';
import { getCursor, setCursor } from './cursors';
import { pullTombstones } from './tombstones';

const PAGE = 500;

/** Incrementally pull one table: rows with `updated_at` past the cursor, LWW-merged. */
async function pullTable(table: string): Promise<void> {
  const db = getDb();
  let cursor = await getCursor(db, table);

  for (;;) {
    let q = supabase
      .from(table)
      .select('*')
      .order('updated_at', { ascending: true })
      .limit(PAGE);
    if (cursor) q = q.gt('updated_at', cursor);

    const { data, error } = await q;
    if (error) {
      // One table failing (e.g. a not-yet-migrated column) must not abort the rest.
      console.warn(`[offline] pull skipped for ${table}:`, error.message);
      return;
    }
    const rows = (data ?? []) as Record<string, unknown>[];
    if (rows.length === 0) break;

    await db.withTransactionAsync(async () => {
      for (const row of rows) {
        const id = row.id as string;
        // Don't clobber a row with an un-pushed local edit — it wins until pushed.
        if (await hasPendingForRow(db, table, id)) continue;
        await upsertFromServer(db, table, row, (row.updated_at as string) ?? null);
      }
      const maxUpdated = rows[rows.length - 1].updated_at as string | undefined;
      if (maxUpdated) await setCursor(db, table, maxUpdated);
    });

    cursor = rows[rows.length - 1].updated_at as string;
    if (rows.length < PAGE) break;
  }
}

/** Pull every synced table (parents first) then tombstones. */
export async function pullAll(): Promise<void> {
  for (const table of SYNC_PULL_ORDER) {
    await pullTable(table);
  }
  await pullTombstones();
}

/** Whether a full pull has ever completed (used to gate offline-first reads). */
export async function hasEverSynced(): Promise<boolean> {
  const db = getDb();
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_cursors');
  return (r?.n ?? 0) > 0;
}
