import type { SQLiteDatabase } from 'expo-sqlite';

// ── pull cursors (per table, plus the 'tombstones' pseudo-table) ────────────

export async function getCursor(db: SQLiteDatabase, table: string): Promise<string | null> {
  const r = await db.getFirstAsync<{ last_pulled_at: string | null }>(
    `SELECT last_pulled_at FROM sync_cursors WHERE table_name = ?`,
    [table] as never[],
  );
  return r?.last_pulled_at ?? null;
}

export async function setCursor(
  db: SQLiteDatabase,
  table: string,
  lastPulledAt: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_cursors (table_name, last_pulled_at) VALUES (?, ?)
     ON CONFLICT (table_name) DO UPDATE SET last_pulled_at = excluded.last_pulled_at`,
    [table, lastPulledAt] as never[],
  );
}

// ── meta (active tenant id, device id, …) ───────────────────────────────────

export async function getMeta(db: SQLiteDatabase, key: string): Promise<string | null> {
  const r = await db.getFirstAsync<{ value: string | null }>(
    `SELECT value FROM sync_meta WHERE key = ?`,
    [key] as never[],
  );
  return r?.value ?? null;
}

export async function setMeta(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_meta (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [key, value] as never[],
  );
}

export const META_ACTIVE_TENANT = 'active_tenant_id';
