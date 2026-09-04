import type { SQLiteDatabase } from "expo-sqlite";

export const META_ACTIVE_TENANT = "active_tenant_id";
export const META_ACTIVE_BRANCH_SCOPE = "active_branch_scope";
export const META_LAST_PULLED_AT = "last_pulled_at";
export const META_LAST_SYNC_AT = "last_sync_at";

/** Read a meta value (null if unset). */
export async function getMeta(
  db: SQLiteDatabase,
  key: string,
): Promise<string | null> {
  const r = await db.getFirstAsync<{ value: string | null }>(
    "SELECT value FROM sync_meta WHERE key = ?",
    [key] as never[],
  );
  return r?.value ?? null;
}

/** Write a meta value (insert or replace). */
export async function setMeta(
  db: SQLiteDatabase,
  key: string,
  value: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_meta (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [key, value] as never[],
  );
}
