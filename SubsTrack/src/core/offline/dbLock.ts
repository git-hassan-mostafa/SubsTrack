/**
 * The one lock over the local SQLite connection.
 *
 * The whole native app shares ONE handle (`getDb()`), and SQLite allows only one
 * open transaction on it at a time — two overlapping `BEGIN`s throw "cannot start
 * a transaction within a transaction". So every local write queues here: a
 * repository `write()` (e.g. WalletService moving several collections at once
 * via `Promise.all`) and every sync merge alike.
 *
 * **One queue for the whole process is the point.** Two separate locks would each
 * be internally consistent and still collide with each other — which is exactly
 * what happened when the sync opened its own transactions beside the repository
 * queue, and saving a payment during a big post-login pull threw.
 */
let queue: Promise<unknown> = Promise.resolve();

export function withDbLock<T>(fn: () => Promise<T>): Promise<T> {
  // Chain on regardless of whether the previous task succeeded, then keep the
  // queue alive by swallowing this task's outcome — the real result/rejection
  // still reaches the caller through `next`.
  const next = queue.then(fn, fn);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
