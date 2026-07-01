import type { SQLiteDatabase } from 'expo-sqlite';
import { newId, nowIso } from '../ids';

export type OutboxOpType = 'insert' | 'update' | 'void' | 'soft_delete' | 'hard_delete';
export type OutboxStatus = 'pending' | 'inflight' | 'done' | 'parked';

export interface OutboxEntry {
  op_seq: number;
  id: string;
  table_name: string;
  op_type: OutboxOpType;
  row_id: string;
  payload: string; // JSON
  base_version: string | null;
  created_at: string;
  status: OutboxStatus;
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
}

export interface EnqueueOp {
  tableName: string;
  opType: OutboxOpType;
  rowId: string;
  payload: unknown; // serialized to JSON — the args the replay executor needs
  baseVersion?: string | null; // _server_updated_at when queued (conflict guard)
}

/**
 * Append an outbox entry. MUST be called inside the SAME SQLite transaction as
 * the local data mutation — the durability guarantee is that a row never lands
 * without its sync intent, and an intent never lands without its row.
 */
export async function enqueue(db: SQLiteDatabase, op: EnqueueOp): Promise<void> {
  await db.runAsync(
    `INSERT INTO outbox (id, table_name, op_type, row_id, payload, base_version, created_at, status, attempts)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0)`,
    [
      newId(),
      op.tableName,
      op.opType,
      op.rowId,
      JSON.stringify(op.payload ?? null),
      op.baseVersion ?? null,
      nowIso(),
    ] as never[],
  );
}

/** Pending ops whose backoff has elapsed, FIFO by op_seq (preserves causal order). */
export async function dueOps(db: SQLiteDatabase, limit = 200): Promise<OutboxEntry[]> {
  return db.getAllAsync<OutboxEntry>(
    `SELECT * FROM outbox
     WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
     ORDER BY op_seq ASC LIMIT ?`,
    [nowIso(), limit] as never[],
  );
}

/** Success — the op reached the server; drop it (done == removed, keeps table lean). */
export async function markDone(db: SQLiteDatabase, opSeq: number): Promise<void> {
  await db.runAsync(`DELETE FROM outbox WHERE op_seq = ?`, [opSeq] as never[]);
}

/** Transient failure — schedule a retry with backoff. */
export async function markRetry(
  db: SQLiteDatabase,
  opSeq: number,
  attempts: number,
  nextAttemptAt: string,
  error: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE outbox SET status = 'pending', attempts = ?, next_attempt_at = ?, last_error = ? WHERE op_seq = ?`,
    [attempts, nextAttemptAt, error, opSeq] as never[],
  );
}

/** Permanent rejection (RLS / tier-limit / constraint) — park it; never drop. */
export async function markParked(db: SQLiteDatabase, opSeq: number, error: string): Promise<void> {
  await db.runAsync(`UPDATE outbox SET status = 'parked', last_error = ? WHERE op_seq = ?`, [
    error,
    opSeq,
  ] as never[]);
}

/** True if a row still has an un-pushed (or in-flight) op — pull must not clobber it. */
export async function hasPendingForRow(
  db: SQLiteDatabase,
  table: string,
  rowId: string,
): Promise<boolean> {
  const r = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM outbox WHERE table_name = ? AND row_id = ? AND status IN ('pending', 'inflight')`,
    [table, rowId] as never[],
  );
  return (r?.n ?? 0) > 0;
}

export async function countPending(db: SQLiteDatabase): Promise<number> {
  const r = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM outbox WHERE status IN ('pending', 'inflight')`,
  );
  return r?.n ?? 0;
}

export async function countParked(db: SQLiteDatabase): Promise<number> {
  const r = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM outbox WHERE status = 'parked'`,
  );
  return r?.n ?? 0;
}
