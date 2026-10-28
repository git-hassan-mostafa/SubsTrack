import { FakeDb, mirrorRow } from "../helpers/fakeSqlite";
import { FakeSupabase, type RecordedSelect } from "../helpers/fakeSupabase";

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
  startSync,
  syncNow,
} from "@/src/core/offline/sync/engine";
import { getSyncStatus } from "@/src/core/offline/sync/status";
import { CLIENT_VERSION } from "@shared/modules/options/utils/clientVersion";

const MINUTE = 60 * 1000;
const PULL_EVERY = 10 * MINUTE;

const stamped = (ageMs: number) => [
  { key: "last_sync_at", value: new Date(Date.now() - ageMs).toISOString() },
];

const isVersionCheck = (s: RecordedSelect) =>
  s.table === "app_options" && s.eq !== null;
const pulled = () => mockServer.selects.some((s) => !isVersionCheck(s));
const pushed = () => mockServer.upserts.length > 0;

const metaStamp = (key: string) =>
  mockDb.rows("sync_meta").find((r) => r.key === key);

beforeEach(() => {
  mockServer.reset();
  mockOnline = true;
  mockDb = new FakeDb({});
});

describe("TC-SY-70..74 — the 10-minute pull gate skips the pull, never the push", () => {
  it("TC-SY-70 runs a full cycle when the mirror has never synced", async () => {
    await runSyncIfDue();

    expect(pulled()).toBe(true);
  });

  it("TC-SY-71 runs a full cycle once the last pull is 10 minutes old", async () => {
    mockDb = new FakeDb({ sync_meta: stamped(PULL_EVERY + MINUTE) });

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

  it("TC-SY-74 a fresh mirror with nothing dirty pushes and pulls nothing", async () => {
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

  it("TC-SY-78 syncNow ignores the pull gate entirely", async () => {
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

describe("TC-SY-86..88 — last push, pull and manual sync times", () => {
  it("TC-SY-86 a push-only flush stamps the push, not the pull", async () => {
    await flushPendingWrites();

    expect(metaStamp("last_push_at")).toBeDefined();
    expect(metaStamp("last_sync_at")).toBeUndefined();
    expect(getSyncStatus().lastPushAt).toBe(metaStamp("last_push_at")?.value);
  });

  it("TC-SY-87 only a manual sync stamps the manual time", async () => {
    await runSync();
    expect(metaStamp("last_manual_sync_at")).toBeUndefined();

    await syncNow();
    expect(metaStamp("last_manual_sync_at")).toBeDefined();
  });

  it("TC-SY-88 a failed manual sync does not stamp the manual time", async () => {
    mockServer.failTables.add("currencies");

    await syncNow();

    expect(metaStamp("last_manual_sync_at")).toBeUndefined();
  });
});

describe("TC-SY-91..93 — a build below MinClientVersion stops syncing", () => {
  const requireVersion = (version: number) =>
    mockServer.setRows("app_options", [
      { key: "MinClientVersion", value: String(version) },
    ]);

  it("TC-SY-91 an outdated build neither pushes nor pulls, and says so", async () => {
    requireVersion(CLIENT_VERSION + 1);
    mockDb = new FakeDb({
      collections: [mirrorRow("collections", { id: "cash" }, 1)],
    });

    await runSync();

    expect(pushed()).toBe(false);
    expect(pulled()).toBe(false);
    expect(getSyncStatus().outdated).toBe(true);
  });

  it("TC-SY-92 an outdated build never pushes money from the 5-minute flush", async () => {
    requireVersion(CLIENT_VERSION + 1);
    mockDb = new FakeDb({
      collections: [mirrorRow("collections", { id: "cash" }, 1)],
    });

    await flushPendingWrites();

    expect(pushed()).toBe(false);
  });

  it("TC-SY-93 a build at MinClientVersion syncs and clears the flag", async () => {
    requireVersion(CLIENT_VERSION);
    mockDb = new FakeDb({
      collections: [mirrorRow("collections", { id: "cash" }, 1)],
    });

    await runSync();

    expect(pushed()).toBe(true);
    expect(getSyncStatus().outdated).toBe(false);
  });
});

describe("TC-SY-89..90 — push every 5 minutes, pull every 10", () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("TC-SY-89 the push timer never pulls; the pull timer does", async () => {
    mockDb = new FakeDb({ sync_meta: stamped(MINUTE) });
    await startSync(() => undefined);
    mockServer.reset();
    const startupPush = getSyncStatus().lastPushAt;

    await jest.advanceTimersByTimeAsync(5 * MINUTE);
    expect(getSyncStatus().lastPushAt).not.toBe(startupPush);
    expect(pulled()).toBe(false);

    await jest.advanceTimersByTimeAsync(5 * MINUTE);
    expect(pulled()).toBe(true);
  });

  it("TC-SY-90 a manual sync restarts both timers", async () => {
    await jest.advanceTimersByTimeAsync(2 * MINUTE);
    await syncNow();
    const manualPush = getSyncStatus().lastPushAt;
    mockServer.reset();

    await jest.advanceTimersByTimeAsync(4 * MINUTE);
    expect(getSyncStatus().lastPushAt).toBe(manualPush);

    await jest.advanceTimersByTimeAsync(5 * MINUTE);
    expect(pulled()).toBe(false);

    await jest.advanceTimersByTimeAsync(MINUTE);
    expect(pulled()).toBe(true);
  });
});
