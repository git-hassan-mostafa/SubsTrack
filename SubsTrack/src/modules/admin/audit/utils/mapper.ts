import type { AuditChange, AuditEntry, AuditTable } from '@/src/core/types';
import type { DbAuditLog } from '@/src/core/types/db';
import { isHiddenColumn } from './valueDisplay';

/** NULL, undefined and '' all mean "no value" — see `isNoOp`. */
function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

/**
 * A pair that says nothing: an untouched optional field submitting '' over a NULL
 * column, which rendered as "(empty) → (empty)".
 *
 * `buildAuditRow` already refuses to WRITE these, but the filter is needed here
 * too and is not redundant: `audit_logs` is append-only, so rows written before
 * that fix can never be corrected, and a device still on an older build keeps
 * producing them. The read side is the only place that can hide both.
 */
function isNoOp(before: unknown, after: unknown): boolean {
  return isBlank(before) && isBlank(after);
}

/** Turn the stored diff into a display-ready "field: old → new" list. */
function toChanges(row: DbAuditLog): AuditChange[] {
  if (!row.changed) return [];
  return row.changed
    .filter((field) => !isHiddenColumn(field))
    .map((field) => ({
      field,
      before: row.before_data?.[field] ?? null,
      after: row.after_data?.[field] ?? null,
    }))
    .filter((c) => !isNoOp(c.before, c.after));
}

/**
 * Every column value the row carries, new values winning. Feeds the display
 * registry: `tenant_settings.value` can only be decoded through its `key`, which an
 * edit stores alongside the diff (see `CONTEXT_FIELDS`). An older row simply has
 * less here, and its formatter falls back to the raw value.
 */
function toContext(row: DbAuditLog): Record<string, unknown> {
  return { ...row.before_data, ...row.after_data };
}

export function mapDbAuditLogToAuditEntry(row: DbAuditLog): AuditEntry {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    table: row.table_name as AuditTable,
    recordId: row.record_id,
    action: row.action,
    changes: toChanges(row),
    snapshot: row.changed ? null : (row.after_data ?? row.before_data),
    context: toContext(row),
    label: row.label,
    subject: row.subject ?? null,
    subjectId: row.subject_id ?? null,
    actorUserId: row.actor_user_id,
    actorUsername: row.actor_username,
    occurredAt: row.occurred_at,
  };
}
