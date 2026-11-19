import type { SyncStatus } from "./status";

export const SYNC_REQUIRED_AFTER_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

type ServerContact = Pick<SyncStatus, "lastPushAt" | "lastPullAt">;

// A manual sync also stamps the push, so push + pull cover every kind of sync.
export function lastServerContactAt(status: ServerContact): string | null {
  const times = [status.lastPushAt, status.lastPullAt].filter(
    (at): at is string => at !== null,
  );
  if (times.length === 0) return null;
  return times.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b));
}

// Never synced = still signing in (that needs the internet anyway), so never blocked.
export function isSyncOverdue(status: ServerContact, nowMs: number): boolean {
  const last = lastServerContactAt(status);
  if (!last) return false;
  return nowMs - Date.parse(last) > SYNC_REQUIRED_AFTER_DAYS * DAY_MS;
}
