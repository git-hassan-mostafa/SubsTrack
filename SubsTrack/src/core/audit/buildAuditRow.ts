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
  before?: AuditRowInput | null;
  after?: AuditRowInput | null;
  branchId?: string | null;
  label?: string;
  subject?: string | null;
  customerId?: string | null;
}

const IGNORED_FIELDS = new Set(['updated_at', 'balance']);

// Identity columns carried into after_data even when unchanged — see gotcha #132.
const CONTEXT_FIELDS: Partial<Record<AuditTable, string[]>> = {
  charges: ['billing_month', 'kind', 'description', 'currency_id'],
  collections: ['amount', 'currency_id', 'kind'],
  plans: ['name', 'currency_id'],
  products: ['name', 'currency_id'],
  services: ['name'],
  users: ['full_name'],
  branches: ['name'],
  currencies: ['code'],
  tenants: ['name'],
  skipped_months: ['billing_month', 'skipped'],
  customer_plans: ['plan_id'],
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
    if (v !== null && typeof v === 'object') continue;
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
  if (!user?.tenantId) return null;

  const before = ownColumns((input.before ?? null) as Record<string, unknown> | null);
  const after = ownColumns((input.after ?? null) as Record<string, unknown> | null);

  let changed: string[] | null = null;
  let beforeData: Record<string, unknown> | null = null;
  let afterData: Record<string, unknown> | null = null;

  if (before && after) {
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
    if (names.length === 0) return null;
    for (const f of CONTEXT_FIELDS[input.table] ?? []) {
      if (names.includes(f) || isBlank(after[f])) continue;
      diffAfter[f] = after[f];
    }
    changed = names;
    beforeData = diffBefore;
    afterData = diffAfter;
  } else if (after) {
    afterData = after;
  } else if (before) {
    beforeData = before;
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
    subject: input.subject ?? (input.table === 'customers' ? subjectOfRow(row) : null),
    subject_id: input.customerId ?? (input.table === 'customers' ? input.recordId : null),
    actor_user_id: user.id,
    actor_username: user.username,
    occurred_at: now,
    created_at: now,
    updated_at: now,
  };
}
