import { AppState } from 'react-native';
import { IS_OFFLINE_CAPABLE } from '../platform';
import { isOnline, subscribeConnectivity } from '../net/connectivity';
import { pushOutbox } from './push';
import { pullAll } from './pull';

let running: Promise<void> | null = null;
let started = false;

/** One full sync cycle — push the outbox, then pull server truth. Serialized. */
export async function runSync(): Promise<void> {
  if (!IS_OFFLINE_CAPABLE) return;
  if (running) return running; // single in-flight run
  running = (async () => {
    if (!(await isOnline())) return;
    try {
      await pushOutbox();
      await pullAll();
    } catch (e) {
      console.warn('[offline] sync failed:', e instanceof Error ? e.message : e);
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

let debounce: ReturnType<typeof setTimeout> | null = null;

/** Debounced kick after a local write. No-op offline — the next reconnect retries. */
export function requestSync(delayMs = 800): void {
  if (!IS_OFFLINE_CAPABLE) return;
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    void runSync();
  }, delayMs);
}

/** Register connectivity / foreground / periodic sync triggers. Idempotent. */
export function startSyncEngine(): void {
  if (!IS_OFFLINE_CAPABLE || started) return;
  started = true;
  subscribeConnectivity((online) => {
    if (online) void runSync();
  });
  AppState.addEventListener('change', (s) => {
    if (s === 'active') void runSync();
  });
  setInterval(() => {
    if (AppState.currentState === 'active') void runSync();
  }, 90_000);
  void runSync();
}
