import type { AuditChange, AuditEntry, AuditTable } from '@/src/core/types';
import type { DbAuditLog } from '@/src/core/types/db';

/**
 * Columns never worth showing: tenant/branch scoping the viewer already knows,
 * timestamps the entry itself carries, and the generated `balance` (a restatement
 * of amount_due - amount_paid, both of which are in the diff already).
 */
const HIDDEN_FIELDS = new Set([
  'id',
  'tenant_id',
  'created_at',
  'updated_at',
  'balance',
]);

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
    .filter((field) => !HIDDEN_FIELDS.has(field))
    .map((field) => ({
      field,
      before: row.before_data?.[field] ?? null,
      after: row.after_data?.[field] ?? null,
    }))
    .filter((c) => !isNoOp(c.before, c.after));
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
    // create keeps the whole new row, delete the whole removed one; an edit keeps
    // only the changed columns, which are already in `changes`.
    snapshot: row.changed ? null : (row.after_data ?? row.before_data),
    label: row.label,
    actorUserId: row.actor_user_id,
    actorUsername: row.actor_username,
    occurredAt: row.occurred_at,
  };
}
