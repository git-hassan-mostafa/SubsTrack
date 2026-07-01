import { supabase } from '@/src/shared/lib/supabase';
import type { OutboxEntry } from '../outbox/outbox';

/** A rejection that should PARK the op (never retried) — RLS, constraint, tier-limit, conflict. */
export class PermanentSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentSyncError';
  }
}

// Postgres/PostgREST rejections are permanent; network/timeout/5xx are transient.
function isPermanent(error: { code?: string; status?: number } | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  if (/^[0-9A-Z]{5}$/.test(code)) return true; // SQLSTATE (23505 unique, 42501 RLS, 23503 FK, …)
  if (code.startsWith('PGRST')) return true;
  if (typeof error.status === 'number' && error.status >= 400 && error.status < 500) return true;
  return false;
}

interface ReplayPayload {
  row?: Record<string, unknown>; // full Db row (snake_case) for insert/upsert
  fields?: Record<string, unknown>; // changed columns for update/void/soft_delete
  onConflict?: string; // upsert conflict target (default 'id')
}

/**
 * Replay one outbox op against Supabase under the user's JWT (RLS still applies).
 * Throws PermanentSyncError for park-worthy rejections; plain Error for transient
 * failures that should be retried with backoff.
 */
export async function replay(entry: OutboxEntry): Promise<void> {
  const payload = JSON.parse(entry.payload) as ReplayPayload;
  const table = entry.table_name;
  let error: { code?: string; status?: number; message?: string } | null = null;

  switch (entry.op_type) {
    case 'insert': {
      const onConflict = payload.onConflict ?? 'id';
      ({ error } = await supabase.from(table).upsert(payload.row!, { onConflict }));
      break;
    }
    case 'update': {
      let q = supabase.from(table).update(payload.fields!).eq('id', entry.row_id);
      // Conflict guard for high-value edits: only apply if the row hasn't moved.
      if (entry.base_version) q = q.eq('updated_at', entry.base_version);
      const res = await q.select('id');
      error = res.error;
      if (!error && entry.base_version && (res.data?.length ?? 0) === 0) {
        throw new PermanentSyncError('conflict: row changed on the server since this edit');
      }
      break;
    }
    case 'void': {
      // Monotonic — re-voiding an already-voided row matches 0 rows = no-op success.
      ({ error } = await supabase
        .from(table)
        .update(payload.fields!)
        .eq('id', entry.row_id)
        .is('voided_at', null));
      break;
    }
    case 'soft_delete': {
      ({ error } = await supabase.from(table).update(payload.fields!).eq('id', entry.row_id));
      break;
    }
    case 'hard_delete': {
      ({ error } = await supabase.from(table).delete().eq('id', entry.row_id));
      break;
    }
  }

  if (error) {
    if (isPermanent(error)) throw new PermanentSyncError(error.message ?? 'rejected');
    throw new Error(error.message ?? 'transient sync failure');
  }
}
