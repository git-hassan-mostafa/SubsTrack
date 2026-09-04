import type { SQLiteDatabase } from 'expo-sqlite';
import { getDb, wipeOfflineData } from '../db/sqlite';
import { TABLES } from '../db/tables';
import { getMeta, setMeta, META_ACTIVE_TENANT, META_ACTIVE_BRANCH_SCOPE } from '../sync';

export interface TenantScopeResult {
  wiped: boolean;
  blockedByPending: boolean;
}

export const BRANCH_SCOPE_TENANT_WIDE = '__all__';

/** Normalize a user's branch_id into the branch-scope key stored in sync_meta. */
export function branchScopeKey(branchId: string | null): string {
  return branchId ?? BRANCH_SCOPE_TENANT_WIDE;
}

/**
 * Any local change not yet pushed: a `_dirty` row in any tenant table, or a
 * logged hard delete. `appendOnly` log tables (audit_logs, exception_logs) are
 * excluded — they are not the user's money, and refusing a login because a crash
 * log or an audit entry is still queued is the wrong trade. Logout already calls
 * flushPendingWrites(), so in the normal flow they are pushed before any wipe.
 */
export async function hasUnsyncedWrites(db: SQLiteDatabase): Promise<boolean> {
  const del = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM pending_deletes');
  if ((del?.n ?? 0) > 0) return true;
  for (const t of TABLES) {
    if (t.scope !== 'tenant' || t.appendOnly) continue;
    const r = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t.name} WHERE _dirty = 1`);
    if ((r?.n ?? 0) > 0) return true;
  }
  return false;
}

/**
 * Ensure the local DB belongs to `tenantId` AND to the logging-in user's branch
 * scope. RLS returns a different row set for a tenant-wide admin (all branches)
 * than for a branch-scoped user (their branch only), so switching between them —
 * even within the same tenant — must re-scope the mirror, or a branch user's
 * partial pull / reconcile would silently drop the other branches' rows (and a
 * later tenant-wide login would never re-pull them, the cursor having moved on).
 *
 * On a different tenant OR a different branch scope, wipe all local data (a full
 * re-pull repopulates). Safety guard: refuse the wipe while un-pushed writes
 * remain so money is never lost — the caller surfaces `blockedByPending` and
 * keeps the prior data until it syncs.
 */
export async function ensureTenantScope(
  tenantId: string,
  branchId: string | null,
): Promise<TenantScopeResult> {
  const db = getDb();
  const current = await getMeta(db, META_ACTIVE_TENANT);
  const currentScope = await getMeta(db, META_ACTIVE_BRANCH_SCOPE);
  const scope = branchScopeKey(branchId);

  if (current === tenantId && currentScope === scope) {
    return { wiped: false, blockedByPending: false };
  }
  if (!current) {
    await setMeta(db, META_ACTIVE_TENANT, tenantId);
    await setMeta(db, META_ACTIVE_BRANCH_SCOPE, scope);
    return { wiped: false, blockedByPending: false };
  }
  if (await hasUnsyncedWrites(db)) {
    return { wiped: false, blockedByPending: true };
  }
  await wipeOfflineData();
  await setMeta(db, META_ACTIVE_TENANT, tenantId);
  await setMeta(db, META_ACTIVE_BRANCH_SCOPE, scope);
  return { wiped: true, blockedByPending: false };
}
