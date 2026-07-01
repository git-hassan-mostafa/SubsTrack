import { getDb } from '../db/sqlite';
import {
  dueOps,
  hasPendingForRow,
  markDone,
  markParked,
  markRetry,
} from '../outbox/outbox';
import { replay, PermanentSyncError } from './executors';

const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 2_000;
const CAP_BACKOFF_MS = 5 * 60 * 1_000;

function backoffAt(attempts: number): string {
  const base = Math.min(CAP_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempts);
  const jitter = base * 0.2 * Math.random();
  return new Date(Date.now() + base + jitter).toISOString();
}

/**
 * Replay the outbox FIFO by op_seq. On success, clear the row's `_dirty` flag
 * once no other op references it (so pull can resume merging server truth).
 * Returns true if the queue fully drained (nothing left pending).
 */
export async function pushOutbox(): Promise<boolean> {
  const db = getDb();
  const ops = await dueOps(db);
  for (const op of ops) {
    try {
      await replay(op);
      await markDone(db, op.op_seq);
      if (op.op_type !== 'hard_delete' && !(await hasPendingForRow(db, op.table_name, op.row_id))) {
        await db.runAsync(`UPDATE ${op.table_name} SET _dirty = 0 WHERE id = ?`, [op.row_id] as never[]);
      }
    } catch (e) {
      const attempts = op.attempts + 1;
      const message = e instanceof Error ? e.message : String(e);
      if (e instanceof PermanentSyncError || attempts >= MAX_ATTEMPTS) {
        // Parked ops are surfaced, never dropped; they don't block independent later ops.
        await markParked(db, op.op_seq, message);
        continue;
      }
      // Transient (likely offline) — back off and stop to preserve FIFO causality.
      await markRetry(db, op.op_seq, attempts, backoffAt(attempts), message);
      return false;
    }
  }
  return true;
}
