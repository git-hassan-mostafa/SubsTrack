import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

// `isInternetReachable` is null while unknown (just after boot). Treat unknown
// as online — we'd rather attempt a sync and fail than block on a false offline.
function computeOnline(s: NetInfoState): boolean {
  return !!s.isConnected && s.isInternetReachable !== false;
}

let current = true;

// Keep a cheap synchronous snapshot for hot paths (offline writes check it
// without awaiting). NetInfo pushes updates as connectivity changes.
NetInfo.addEventListener((s) => {
  current = computeOnline(s);
});

/** Authoritative async check (forces a fresh probe). */
export async function isOnline(): Promise<boolean> {
  const s = await NetInfo.fetch();
  current = computeOnline(s);
  return current;
}

/** Last known connectivity without awaiting. */
export function getIsOnline(): boolean {
  return current;
}