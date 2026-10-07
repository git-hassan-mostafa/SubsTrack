import { getDb } from "../offline/db/sqlite";
import { insertDirty } from "../offline/db/dml";
import { newId, nowIso } from "@shared/core/utils/ids";
import { runtime, type ExceptionInput } from "@shared/core/runtime/runtime";

// Never throws: it runs inside error paths, so it must not mask the real error.
export async function logException(input: ExceptionInput): Promise<void> {
  try {
    const user = runtime().actor();
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
    await insertDirty(getDb(), "exception_logs", row);
  } catch (loggingError) {
    console.error("[errorLogger] failed to log exception:", loggingError);
  }
}
