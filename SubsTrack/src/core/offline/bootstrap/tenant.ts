import { getDb, wipeOfflineData } from '../db/sqlite';
import { getMeta, setMeta, META_ACTIVE_TENANT } from '../sync/cursors';
import { countPending } from '../outbox/outbox';

export interface TenantScopeResult {
  wiped: boolean;
  /** True when a different tenant logged in but the prior tenant still has un-synced writes. */
  blockedByPending: boolean;
}

/**
 * Ensure the local DB belongs to `tenantId`. On a different-tenant login, wipe
 * all local data + cursors (a full re-pull repopulates). Safety guard: refuse
 * the wipe while un-pushed writes remain so money is never lost — the caller
 * surfaces `blockedByPending` and keeps the prior tenant's data until it drains.
 */
export async function ensureTenantScope(tenantId: string): Promise<TenantScopeResult> {
  const db = getDb();
  const current = await getMeta(db, META_ACTIVE_TENANT);

  if (current === tenantId) return { wiped: false, blockedByPending: false };
  if (!current) {
    await setMeta(db, META_ACTIVE_TENANT, tenantId);
    return { wiped: false, blockedByPending: false };
  }
  if ((await countPending(db)) > 0) {
    return { wiped: false, blockedByPending: true };
  }
  await wipeOfflineData();
  await setMeta(db, META_ACTIVE_TENANT, tenantId);
  return { wiped: true, blockedByPending: false };
}
