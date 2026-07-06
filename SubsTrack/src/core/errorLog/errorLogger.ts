import { IS_OFFLINE_CAPABLE } from '../offline/platform';
import { getDb } from '../offline/db/sqlite';
import { insertDirty } from '../offline/db/dml';
import { newId, nowIso } from '../offline/ids';
import type { getStore as GetStore } from '@/src/state/globalStore';

export type ExceptionSource = 'boundary' | 'global_handler' | 'repository' | 'service';

interface LogExceptionInput {
  source: ExceptionSource;
  message: string;
  stack?: string;
  context?: string;
}

/**
 * Write one row to the local exception_logs table (pushed to Supabase on the
 * next sync, never pulled back — see TableSpec.pushOnly). Never throws: this
 * runs inside error-handling paths themselves, so a logging failure must not
 * mask or replace the original error.
 *
 * `globalStore` is required lazily (not at module scope): this file is
 * imported by BaseRepository/OfflineBaseRepository, which every service's
 * repository — and therefore every slice — transitively imports, so a
 * top-level import of the store here would form a require cycle back into
 * itself and crash with "Cannot access '<var>' before initialization".
 */
export async function logException(input: LogExceptionInput): Promise<void> {
  if (!IS_OFFLINE_CAPABLE) return; // native only, per product decision

  try {
    const { getStore } = require('@/src/state/globalStore') as { getStore: typeof GetStore };
    const user = getStore().getState().auth.user;
    const row = {
      id: newId(),
      tenant_id: user?.tenantId ?? null,
      user_id: user?.id ?? null,
      username: user?.username ?? null,
      source: input.source,
      message: input.message,
      stack: input.stack ?? null,
      context: input.context ?? null,
      occurred_at: nowIso(),
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    await insertDirty(getDb(), 'exception_logs', row);
  } catch (loggingError) {
    console.error('[errorLogger] failed to log exception:', loggingError);
  }
}
