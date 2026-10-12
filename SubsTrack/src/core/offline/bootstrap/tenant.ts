import type { SQLiteDatabase } from "expo-sqlite";
import type { UserRole } from "@shared/core/types";
import { getDb, wipeOfflineData } from "../db/sqlite";
import { roleScopeOf, scopeKeyOf } from "../scope";
import { TABLES } from "../db/tables";
import {
  getMeta,
  setMeta,
  META_ACTIVE_TENANT,
  META_ACTIVE_BRANCH_SCOPE,
  META_ACTIVE_ROLE_SCOPE,
} from "../sync";

export interface TenantScopeResult {
  wiped: boolean;
  blockedByPending: boolean;
}

/** Un-pushed money only — `appendOnly` logs never block a login (#154). */
export async function hasUnsyncedWrites(db: SQLiteDatabase): Promise<boolean> {
  const del = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM pending_deletes",
  );
  if ((del?.n ?? 0) > 0) return true;
  for (const t of TABLES) {
    if (t.scope !== "tenant" || t.appendOnly) continue;
    const r = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${t.name} WHERE _dirty = 1`,
    );
    if ((r?.n ?? 0) > 0) return true;
  }
  return false;
}

interface ActiveScope {
  tenantId: string | null;
  branchScope: string | null;
  roleScope: string | null;
}

async function readActiveScope(db: SQLiteDatabase): Promise<ActiveScope> {
  return {
    tenantId: await getMeta(db, META_ACTIVE_TENANT),
    branchScope: await getMeta(db, META_ACTIVE_BRANCH_SCOPE),
    roleScope: await getMeta(db, META_ACTIVE_ROLE_SCOPE),
  };
}

// A null role scope predates role scoping, so it still matches (#154)
function scopeMatches(
  active: ActiveScope,
  tenantId: string,
  branchId: string | null,
  role: UserRole,
): boolean {
  return (
    active.tenantId === tenantId &&
    active.branchScope === scopeKeyOf(branchId) &&
    (active.roleScope === null || active.roleScope === roleScopeOf(role))
  );
}

// Read-only twin of ensureTenantScope's match test — never wipes
export async function holdsTenantScope(
  tenantId: string,
  branchId: string | null,
  role: UserRole,
): Promise<boolean> {
  return scopeMatches(await readActiveScope(getDb()), tenantId, branchId, role);
}

/** Wipe unless tenant + branch + role all match — see gotcha #154. */
export async function ensureTenantScope(
  tenantId: string,
  branchId: string | null,
  role: UserRole,
): Promise<TenantScopeResult> {
  const db = getDb();
  const active = await readActiveScope(db);
  const roleScope = roleScopeOf(role);

  const write = async () => {
    await setMeta(db, META_ACTIVE_TENANT, tenantId);
    await setMeta(db, META_ACTIVE_BRANCH_SCOPE, scopeKeyOf(branchId));
    await setMeta(db, META_ACTIVE_ROLE_SCOPE, roleScope);
  };

  if (scopeMatches(active, tenantId, branchId, role)) {
    if (active.roleScope === null) {
      await setMeta(db, META_ACTIVE_ROLE_SCOPE, roleScope);
    }
    return { wiped: false, blockedByPending: false };
  }
  if (!active.tenantId) {
    await write();
    return { wiped: false, blockedByPending: false };
  }
  if (await hasUnsyncedWrites(db)) {
    return { wiped: false, blockedByPending: true };
  }
  await wipeOfflineData();
  await write();
  return { wiped: true, blockedByPending: false };
}
