import { FakeDb, mirrorRow } from "../helpers/fakeSqlite";
import { FakeSupabase } from "../helpers/fakeSupabase";

// The cycle gate. "Fresh enough" may skip the PULL, never the PUSH: an un-pushed
// row is the only copy of that money, so making it wait out the day keeps a
// collector's cash off the server while the phone is online.

const mockServer = new FakeSupabase();
let mockDb = new FakeDb({});
let mockOnline = true;

jest.mock("@/src/shared/lib/supabase", () => ({
  supabase: {
    from: (t: string) => mockServer.from(t),
    get auth() {
      return mockServer.auth;
    },
  },
}));

jest.mock("@/src/core/offline/db/sqlite", () => ({
  getDb: () => mockDb,
  isOfflineDbReady: () => true,
}));

jest.mock("@/src/core/offline/dbLock", () => ({
  withDbLock: <T,>(fn: () => Promise<T>) => fn(),
}));

jest.mock("@/src/core/offline/net/connectivity", () => ({
  isOnline: async () => mockOnline,
}));

jest.mock("@/src/core/offline/platform", () => ({
  IS_OFFLINE_CAPABLE: true,
}));

import {
  flushPendingWrites,
  runSync,
  runSyncIfDue,
  syncNow,
} from "@/src/core/offline/sync/engine";
import { getSyncStatus } from "@/src/core/offline/sync/status";

const DAY = 24 * 60 * 60 * 1000;

const stamped = (ageMs: number) => [
  { key: "last_sync_at", value: new Date(Date.now() - ageMs).toISOString() },
];

const pulled = () => mockServer.selects.length > 0;
const pushed = () => mockServer.upserts.length > 0;

beforeEach(() => {
  mockServer.reset();
  mockOnline = true;
  mockDb = new FakeDb({});
});

describe("TC-SY-70..74 — the 24-hour gate skips the pull, never the push", () => {
  it("TC-SY-70 runs a full cycle when the mirror has never synced", async () => {
    await runSyncIfDue();

    expect(pulled()).toBe(true);
  });

  it("TC-SY-71 runs a full cycle once the stamp is a day old", async () => {
    mockDb = new FakeDb({ sync_meta: stamped(DAY + 60_000) });

    await runSyncIfDue();

    expect(pulled()).toBe(true);
  });

  it("TC-SY-72 skips the pull while the mirror is still fresh", async () => {
    mockDb = new FakeDb({ sync_meta: stamped(60_000) });

    await runSyncIfDue();

    expect(pulled()).toBe(false);
  });

  it("TC-SY-73 STILL pushes un-pushed money when it skips the pull", async () => {
    mockDb = new FakeDb({
      sync_meta: stamped(60_000),
      collections: [mirrorRow("collections", { id: "cash" }, 1)],
    });

    await runSyncIfDue();

    expect(pulled()).toBe(false);
    expect(mockServer.upserts.map((u) => u.table)).toEqual(["collections"]);
  });

  it("TC-SY-74 a fresh mirror with nothing dirty makes no request at all", async () => {
    mockDb = new FakeDb({ sync_meta: stamped(60_000) });

    await runSyncIfDue();

    expect(pushed()).toBe(false);
    expect(pulled()).toBe(false);
  });
});

describe("TC-SY-75..79 — a cycle needs a session and a connection", () => {
  it("TC-SY-75 does nothing at all while signed out", async () => {
    mockServer.session = { session: null };

    await runSync();

    expect(pushed()).toBe(false);
    expect(pulled()).toBe(false);
  });

  it("TC-SY-76 does nothing while offline", async () => {
    mockOnline = false;

    await runSync();

    expect(pulled()).toBe(false);
  });

  it("TC-SY-77 syncNow reports offline rather than failure", async () => {
    mockOnline = false;

    await expect(syncNow()).resolves.toEqual({ ok: false, offline: true });
  });

  it("TC-SY-78 syncNow ignores the 24h gate entirely", async () => {
    mockDb = new FakeDb({ sync_meta: stamped(60_000) });

    await syncNow();

    expect(pulled()).toBe(true);
  });

  it("TC-SY-79 flushPendingWrites never pulls, even when far overdue", async () => {
    mockDb = new FakeDb({
      collections: [mirrorRow("collections", { id: "cash" }, 1)],
    });

    await flushPendingWrites();

    expect(pushed()).toBe(true);
    expect(pulled()).toBe(false);
  });
});

describe("TC-SY-80..83 — what a cycle records about itself", () => {
  it("TC-SY-80 pushes BEFORE it pulls, so the pull can heal", async () => {
    mockDb = new FakeDb({
      customers: [mirrorRow("customers", { id: "a" }, 1)],
    });

    await runSync();

    expect(pushed()).toBe(true);
    expect(pulled()).toBe(true);
  });

  it("TC-SY-81 stamps last_sync_at only when the cycle completed", async () => {
    await runSync();

    const stamp = mockDb
      .rows("sync_meta")
      .find((r) => r.key === "last_sync_at");
    expect(stamp).toBeDefined();
  });

  it("TC-SY-82 does NOT stamp last_sync_at when a table failed", async () => {
    mockServer.failTables.add("currencies");

    await runSync();

    expect(
      mockDb.rows("sync_meta").find((r) => r.key === "last_sync_at"),
    ).toBeUndefined();
  });

  it("TC-SY-83 reports an incomplete cycle instead of claiming success", async () => {
    mockServer.failTables.add("currencies");

    await runSync();

    expect(getSyncStatus().lastError).toBe("sync_incomplete");
    expect(getSyncStatus().syncing).toBe(false);
  });
});

describe("TC-SY-84..85 — one cycle at a time", () => {
  it("TC-SY-84 a second call joins the running cycle instead of starting one", async () => {
    mockDb = new FakeDb({
      customers: [mirrorRow("customers", { id: "a" }, 1)],
    });

    await Promise.all([runSync(), runSync()]);

    expect(mockServer.upserts.filter((u) => u.table === "customers")).toHaveLength(
      1,
    );
  });

  it("TC-SY-85 leaves `syncing` false once the cycle is over", async () => {
    await runSync();

    expect(getSyncStatus().syncing).toBe(false);
  });
});
