import { FakeDb } from "../helpers/fakeSqlite";

// One device, two people: what is thrown away between them, and what survives.

let mockDb = new FakeDb({});
const mockWipe = jest.fn(async () => {
  for (const name of mockDb.names()) {
    if (name !== "sync_meta") mockDb.clear(name);
  }
  await mockDb.runAsync("DELETE FROM sync_meta WHERE key = ?", [
    "last_pulled_at",
  ]);
  await mockDb.runAsync("DELETE FROM sync_meta WHERE key = ?", [
    "last_sync_at",
  ]);
});

jest.mock("@/src/core/offline/db/sqlite", () => ({
  getDb: () => mockDb,
  isOfflineDbReady: () => true,
  wipeOfflineData: () => mockWipe(),
}));

import { ensureTenantScope } from "@/src/core/offline/bootstrap/tenant";
import { roleScopeOf, scopeKeyOf } from "@/src/core/offline/scope";
import { isPickableBranchFilter } from "@/src/shared/lib/branchFilter";
import { BRANCH_FILTER_UNASSIGNED } from "@/src/core/constants";
import {
  bumpDataEpoch,
  currentDataEpoch,
  isStaleEpoch,
} from "@/src/shared/lib/dataEpoch";
import type { Branch } from "@/src/core/types";

const TENANT = "tenant-a";
const OTHER = "tenant-b";
const BRANCH = "branch-1";

function seed(meta: Record<string, string>, extra: Record<string, unknown[]> = {}) {
  mockDb = new FakeDb({
    sync_meta: Object.entries(meta).map(([key, value]) => ({ key, value })),
    ...extra,
  });
}

function metaOf(key: string): string | null {
  const hit = mockDb.rows("sync_meta").find((r) => r.key === key);
  return hit ? (hit.value as string) : null;
}

beforeEach(() => {
  mockWipe.mockClear();
  seed({});
});

describe("roleScopeOf", () => {
  it("collapses to the only split RLS makes", () => {
    expect(roleScopeOf("admin")).toBe("admin");
    expect(roleScopeOf("superadmin")).toBe("admin");
    expect(roleScopeOf("user")).toBe("staff");
  });

  it("names a tenant-wide session for the branch key", () => {
    expect(scopeKeyOf(null)).toBe("__all__");
    expect(scopeKeyOf(BRANCH)).toBe(BRANCH);
  });
});

describe("ensureTenantScope", () => {
  it("claims an empty mirror without wiping it", async () => {
    const r = await ensureTenantScope(TENANT, null, "admin");
    expect(r).toEqual({ wiped: false, blockedByPending: false });
    expect(mockWipe).not.toHaveBeenCalled();
    expect(metaOf("active_tenant_id")).toBe(TENANT);
    expect(metaOf("active_branch_scope")).toBe("__all__");
    expect(metaOf("active_role_scope")).toBe("admin");
  });

  it("keeps the mirror when the same person signs back in", async () => {
    seed({
      active_tenant_id: TENANT,
      active_branch_scope: "__all__",
      active_role_scope: "admin",
    });
    const r = await ensureTenantScope(TENANT, null, "admin");
    expect(r.wiped).toBe(false);
    expect(mockWipe).not.toHaveBeenCalled();
  });

  it("wipes when an admin hands the device to staff in the same branch", async () => {
    seed({
      active_tenant_id: TENANT,
      active_branch_scope: BRANCH,
      active_role_scope: "admin",
    });
    const r = await ensureTenantScope(TENANT, BRANCH, "user");
    expect(r.wiped).toBe(true);
    expect(mockWipe).toHaveBeenCalledTimes(1);
    expect(metaOf("active_role_scope")).toBe("staff");
  });

  it("wipes on a different branch scope", async () => {
    seed({
      active_tenant_id: TENANT,
      active_branch_scope: "__all__",
      active_role_scope: "admin",
    });
    const r = await ensureTenantScope(TENANT, BRANCH, "admin");
    expect(r.wiped).toBe(true);
    expect(metaOf("active_branch_scope")).toBe(BRANCH);
  });

  it("wipes on a different organization", async () => {
    seed({
      active_tenant_id: TENANT,
      active_branch_scope: "__all__",
      active_role_scope: "admin",
    });
    const r = await ensureTenantScope(OTHER, null, "admin");
    expect(r.wiped).toBe(true);
    expect(metaOf("active_tenant_id")).toBe(OTHER);
  });

  it("backfills a mirror written before the role key existed", async () => {
    seed({ active_tenant_id: TENANT, active_branch_scope: "__all__" });
    const r = await ensureTenantScope(TENANT, null, "user");
    expect(r.wiped).toBe(false);
    expect(mockWipe).not.toHaveBeenCalled();
    expect(metaOf("active_role_scope")).toBe("staff");
  });

  it("refuses the wipe while money is still un-pushed", async () => {
    seed(
      {
        active_tenant_id: TENANT,
        active_branch_scope: BRANCH,
        active_role_scope: "admin",
      },
      { collections: [{ id: "c1", _dirty: 1 }] },
    );
    const r = await ensureTenantScope(TENANT, BRANCH, "user");
    expect(r).toEqual({ wiped: false, blockedByPending: true });
    expect(mockWipe).not.toHaveBeenCalled();
    expect(metaOf("active_role_scope")).toBe("admin");
  });

  it("does not let a queued audit row block the switch", async () => {
    seed(
      {
        active_tenant_id: TENANT,
        active_branch_scope: BRANCH,
        active_role_scope: "admin",
      },
      { audit_logs: [{ id: "a1", _dirty: 1 }] },
    );
    const r = await ensureTenantScope(TENANT, BRANCH, "user");
    expect(r.wiped).toBe(true);
  });
});

describe("isPickableBranchFilter", () => {
  const branches: Branch[] = [
    {
      id: BRANCH,
      tenantId: TENANT,
      name: "Main",
      active: true,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "branch-old",
      tenantId: TENANT,
      name: "Closed",
      active: false,
      createdAt: "",
      updatedAt: "",
    },
  ];

  it("keeps the two filters that name no branch", () => {
    expect(isPickableBranchFilter(null, branches)).toBe(true);
    expect(isPickableBranchFilter(BRANCH_FILTER_UNASSIGNED, branches)).toBe(
      true,
    );
  });

  it("keeps a branch this organization still has", () => {
    expect(isPickableBranchFilter(BRANCH, branches)).toBe(true);
  });

  it("drops another organization's branch and a deactivated one", () => {
    expect(isPickableBranchFilter("branch-elsewhere", branches)).toBe(false);
    expect(isPickableBranchFilter("branch-old", branches)).toBe(false);
  });
});

describe("dataEpoch", () => {
  it("marks a load captured before the session ended as stale", () => {
    const captured = currentDataEpoch();
    expect(isStaleEpoch(captured)).toBe(false);
    bumpDataEpoch();
    expect(isStaleEpoch(captured)).toBe(true);
    expect(isStaleEpoch(currentDataEpoch())).toBe(false);
  });
});
