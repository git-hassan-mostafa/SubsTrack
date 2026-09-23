import type { SQLiteDatabase } from "expo-sqlite";
import type { UserRole } from "@/src/core/types";
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

/** Wipe unless tenant + branch + role all match — see gotcha #154. */
export async function ensureTenantScope(
  tenantId: string,
  branchId: string | null,
  role: UserRole,
): Promise<TenantScopeResult> {
  const db = getDb();
  const current = await getMeta(db, META_ACTIVE_TENANT);
  const currentScope = await getMeta(db, META_ACTIVE_BRANCH_SCOPE);
  const currentRole = await getMeta(db, META_ACTIVE_ROLE_SCOPE);
  const scope = scopeKeyOf(branchId);
  const roleScope = roleScopeOf(role);

  const write = async () => {
    await setMeta(db, META_ACTIVE_TENANT, tenantId);
    await setMeta(db, META_ACTIVE_BRANCH_SCOPE, scope);
    await setMeta(db, META_ACTIVE_ROLE_SCOPE, roleScope);
  };

  const roleMatches = currentRole === null || currentRole === roleScope;
  if (current === tenantId && currentScope === scope && roleMatches) {
    if (currentRole === null) {
      await setMeta(db, META_ACTIVE_ROLE_SCOPE, roleScope);
    }
    return { wiped: false, blockedByPending: false };
  }
  if (!current) {
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
