import type { SQLiteDatabase } from 'expo-sqlite';
import { getDb, wipeOfflineData } from '../db/sqlite';
import { TABLES } from '../db/tables';
import { getMeta, setMeta, META_ACTIVE_TENANT } from '../sync';

export interface TenantScopeResult {
  wiped: boolean;
  /** True when a different tenant logged in but the prior tenant still has un-synced writes. */
  blockedByPending: boolean;
}

/** Any local change not yet pushed: a `_dirty` row in any tenant table, or a logged hard delete. */
export async function hasUnsyncedWrites(db: SQLiteDatabase): Promise<boolean> {
  const del = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM pending_deletes');
  if ((del?.n ?? 0) > 0) return true;
  for (const t of TABLES) {
    if (t.scope !== 'tenant') continue;
    const r = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t.name} WHERE _dirty = 1`);
    if ((r?.n ?? 0) > 0) return true;
  }
  return false;
}

/**
 * Ensure the local DB belongs to `tenantId`. On a different-tenant login, wipe
 * all local data (a full re-pull repopulates). Safety guard: refuse the wipe
 * while un-pushed writes remain so money is never lost — the caller surfaces
 * `blockedByPending` and keeps the prior tenant's data until it syncs.
 */
export async function ensureTenantScope(tenantId: string): Promise<TenantScopeResult> {
  const db = getDb();
  const current = await getMeta(db, META_ACTIVE_TENANT);

  if (current === tenantId) return { wiped: false, blockedByPending: false };
  if (!current) {
    await setMeta(db, META_ACTIVE_TENANT, tenantId);
    return { wiped: false, blockedByPending: false };
  }
  if (await hasUnsyncedWrites(db)) {
    return { wiped: false, blockedByPending: true };
  }
  await wipeOfflineData();
  await setMeta(db, META_ACTIVE_TENANT, tenantId);
  return { wiped: true, blockedByPending: false };
}
