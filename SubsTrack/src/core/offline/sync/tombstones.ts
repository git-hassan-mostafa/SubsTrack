import { supabase } from '@/src/shared/lib/supabase';
import { getDb } from '../db/sqlite';
import { TABLE_BY_NAME } from '../db/tables';
import { getCursor, setCursor } from './cursors';

const PAGE = 500;
const CURSOR_KEY = 'tombstones';

interface Tombstone {
  table_name: string;
  row_id: string;
  deleted_at: string;
}

/**
 * Pull hard-delete tombstones and remove the matching local rows, so deletions
 * made on other devices converge here. Skips gracefully if the server
 * `tombstones` table isn't there yet (Postgres migration pending).
 */
export async function pullTombstones(): Promise<void> {
  const db = getDb();
  let cursor = await getCursor(db, CURSOR_KEY);

  for (;;) {
    let q = supabase
      .from('tombstones')
      .select('table_name, row_id, deleted_at')
      .order('deleted_at', { ascending: true })
      .limit(PAGE);
    if (cursor) q = q.gt('deleted_at', cursor);

    const { data, error } = await q;
    if (error) {
      console.warn('[offline] tombstone pull skipped:', error.message);
      return;
    }
    const rows = (data ?? []) as Tombstone[];
    if (rows.length === 0) break;

    await db.withTransactionAsync(async () => {
      for (const t of rows) {
        if (!TABLE_BY_NAME[t.table_name]) continue; // ignore unknown table names (defensive)
        await db.runAsync(`DELETE FROM ${t.table_name} WHERE id = ?`, [t.row_id] as never[]);
      }
      await setCursor(db, CURSOR_KEY, rows[rows.length - 1].deleted_at);
    });

    cursor = rows[rows.length - 1].deleted_at;
    if (rows.length < PAGE) break;
  }
}
