import type { AuditAction, AuditTable } from '@/src/core/types';
import type { DbAuditLog } from '@/src/core/types/db';
import { newId, nowIso } from '../offline/ids';
import type { getStore as GetStore } from '@/src/state/globalStore';
import { describeAudit } from './describe';

/**
 * Any `Db*` row. Deliberately NOT `Record<string, unknown>`: a plain interface has
 * no index signature, so every call site would need a cast to pass one.
 */
type AuditRowInput = object;

export interface AuditInput {
  table: AuditTable;
  recordId: string;
  action: AuditAction;
  /** The row BEFORE the change. Omit for a create. */
  before?: AuditRowInput | null;
  /** The row AFTER the change. Omit for a delete. */
  after?: AuditRowInput | null;
  /** Branch the record belongs to; null/omitted for a tenant-wide record. */
  branchId?: string | null;
  /** Overrides the generated one-liner when the caller has a better name. */
  label?: string;
  /**
   * Who the record belongs to — the customer's name for a payment / sale / skip /
   * plan line. Frozen here rather than resolved from `customer_id` at read time,
   * because a deleted customer leaves the id pointing at nothing. Omit for a
   * record that belongs to nobody (a plan, a setting, a staff member).
   */
  subject?: string | null;
  /**
   * The owning customer, for a child row that has no `subject`/`branchId` of its
   * own. The online repository looks it up in the background (the audit write is
   * detached), filling in whichever of the two fields above the caller omitted.
   *
   * It is also stored as `subject_id` — what a customer's whole timeline filters
   * on — so a table that should appear there must pass this, not just `subject`.
   * Sales deliberately don't: they are not part of the subscription timeline.
   */
  customerId?: string | null;
}

/**
 * Columns that carry no information about what a person changed:
 *  - `updated_at` moves on every write, so including it would make every edit
 *    look like a change even when nothing else moved.
 *  - `balance` is a Postgres GENERATED column (amount_due - amount_paid) — it is
 *    a restatement of two fields already in the diff.
 */
const IGNORED_FIELDS = new Set(['updated_at', 'balance']);

/**
 * Columns an EDIT carries even when they didn't change, because the changed column
 * can't be read without them: `tenant_settings.value` is meaningless on its own —
 * `month_start` under one key, a currency id under another.
 *
 * They stay OUT of `changed`, so they never render as a change; the read side picks
 * them up as `AuditEntry.context` for the display registry (valueDisplay.ts).
 */
const CONTEXT_FIELDS: Partial<Record<AuditTable, string[]>> = {
  tenant_settings: ['key'],
};

/**
 * Drop joined children before diffing. A repository's write often re-reads the row
 * with its join select (`customers` returns a nested `customer_plans` array), while
 * the "before" snapshot is a bare `select('*')`. Diffing those two compares "key
 * absent" against "array of nested rows", so editing one scalar reported a phantom
 * `customer_plans` change and dumped the whole nested JSON into the trail.
 *
 * An audit row describes ONE table's own columns; a child's change gets its own
 * entry from its own repository. So anything non-scalar is not this row's business.
 */
function ownColumns(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== null && typeof v === 'object') continue; // joined row / array of rows
    out[k] = v;
  }
  return out;
}

/** NULL, undefined and '' are all "no value" as far as the trail is concerned. */
function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

/** A row's own `name`, for the one table whose record IS the subject (customers). */
function subjectOfRow(row: Record<string, unknown> | null): string | null {
  const name = row?.name;
  return typeof name === 'string' && name !== '' ? name : null;
}

/** Shallow value compare — enough for the flat scalar rows the mirror stores. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // A missing key, an explicit null and a blank string all mean "no value" here:
  // a form's untouched optional field submits '' where the column holds NULL, and
  // recording that as a change produced trail rows reading "(empty) → (empty)".
  if (isBlank(a) && isBlank(b)) return true;
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

/**
 * Build the audit row for one change: diffs `before`/`after` down to the columns
 * that actually moved, then attaches the actor, tenant and timestamps.
 *
 * Returns `null` when there is nothing worth recording — an update that changed
 * no field (a form saved untouched), or no signed-in user. Callers can pass the
 * result straight to an insert without checking anything else.
 *
 * `globalStore` is required lazily, not imported at module scope: this file is
 * reached from BaseRepository/OfflineBaseRepository, which every service — and
 * therefore every slice — transitively imports, so a top-level import of the
 * store would form a require cycle and crash with "Cannot access '<var>' before
 * initialization". Same reason and same shape as errorLogger.ts.
 */
export function buildAuditRow(input: AuditInput): DbAuditLog | null {
  const { getStore } = require('@/src/state/globalStore') as { getStore: typeof GetStore };
  const user = getStore().getState().auth.user;
  // No signed-in user means no actor to attribute the change to, and RLS would
  // reject the row anyway (tenant_id must match the JWT).
  if (!user?.tenantId) return null;

  const before = ownColumns((input.before ?? null) as Record<string, unknown> | null);
  const after = ownColumns((input.after ?? null) as Record<string, unknown> | null);

  let changed: string[] | null = null;
  let beforeData: Record<string, unknown> | null = null;
  let afterData: Record<string, unknown> | null = null;

  if (before && after) {
    // An edit: keep ONLY the columns that moved. Keeps a row ~150 bytes and
    // makes it readable on its own, without hunting for the previous entry.
    const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
    const diffBefore: Record<string, unknown> = {};
    const diffAfter: Record<string, unknown> = {};
    const names: string[] = [];
    for (const f of fields) {
      if (IGNORED_FIELDS.has(f)) continue;
      if (sameValue(before[f], after[f])) continue;
      names.push(f);
      diffBefore[f] = before[f] ?? null;
      diffAfter[f] = after[f] ?? null;
    }
    if (names.length === 0) return null; // nothing actually changed
    for (const f of CONTEXT_FIELDS[input.table] ?? []) {
      if (!names.includes(f)) diffAfter[f] = after[f] ?? null;
    }
    changed = names;
    beforeData = diffBefore;
    afterData = diffAfter;
  } else if (after) {
    afterData = after; // create — the whole new row
  } else if (before) {
    beforeData = before; // delete — the whole removed row
  }

  const row = after ?? before ?? null;
  const now = nowIso();

  return {
    id: newId(),
    tenant_id: user.tenantId,
    branch_id: input.branchId ?? null,
    table_name: input.table,
    record_id: input.recordId,
    action: input.action,
    before_data: beforeData,
    after_data: afterData,
    changed,
    label: input.label ?? describeAudit(input.table, row),
    // On `customers` the customer IS the record, so its own name and id are the
    // subject — no caller needs to pass either. Elsewhere only the caller knows
    // the parent.
    subject: input.subject ?? (input.table === 'customers' ? subjectOfRow(row) : null),
    subject_id: input.customerId ?? (input.table === 'customers' ? input.recordId : null),
    actor_user_id: user.id,
    actor_username: user.username,
    occurred_at: now,
    created_at: now,
    updated_at: now,
  };
}
