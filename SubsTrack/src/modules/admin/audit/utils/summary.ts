import type { AuditAction, AuditChange, AuditEntry, AuditTable } from '@/src/core/types';
import { formatField, formatFieldLabel, tableLabel } from './format';
import { recordDetail, type RecordDetail } from './recordDetail';
import { isolate } from '@/src/core/utils/bidi';
import { bold, toParts, type SentencePart } from './sentence';
import type { AuditFieldContext } from './valueDisplay';

export interface AuditSummaryOptions {
  showSubject?: boolean;
}

type RecordStyle = 'type_first' | 'detail_first' | 'of_detail';

// How a record names itself: "the March 2026 bill" / "a payment of 30.00 $" / "the plan Gold".
const RECORD_STYLE: Partial<Record<AuditTable, RecordStyle>> = {
  charges: 'detail_first',
  sales: 'detail_first',
  collections: 'of_detail',
};

// A charge's detail is its MONTH, except a manual one, whose detail is a free-text
// description — "the fix router custom debt" reads backwards, so the noun leads.
const KIND_STYLE: Partial<Record<AuditTable, Record<string, RecordStyle>>> = {
  charges: { manual: 'type_first' },
};

// What the row IS, per `kind`: a hand-over by what it PAID FOR, a charge by what
// it owes. A kind with no word here keeps the plain table label — 'mixed' settled
// several, and a month/sale bill is already named by its month or receipt.
const KIND_TYPE: Partial<Record<AuditTable, Record<string, string>>> = {
  collections: {
    month: 'audit.summary.payment.month',
    sale: 'audit.summary.payment.sale',
    manual: 'audit.summary.payment.manual',
  },
  charges: {
    manual: 'audit.summary.bill.manual',
  },
};

// A void carries `kind` in the diff's context; a create only has the whole row.
function recordKind(entry: AuditEntry): string | null {
  const kind = entry.context.kind ?? entry.snapshot?.kind;
  return typeof kind === 'string' && kind !== '' ? kind : null;
}

// Tables whose row BELONGS to a plan; on `plans`/`customer_plans` it IS the record.
const PLAN_QUALIFIED = new Set<AuditTable>(['charges', 'collections']);

/** The plan a bill or hand-over is about, or null when it names none. */
function recordPlan(entry: AuditEntry, ctx: AuditFieldContext): string | null {
  if (!PLAN_QUALIFIED.has(entry.table)) return null;
  const id = entry.context.plan_id ?? entry.snapshot?.plan_id;
  return typeof id === 'string' && id !== '' ? ctx.lookups.plan(id) : null;
}

// Booleans whose NAME means nothing to a reader — "changed regular customer from
// No to Yes" has to become a verb. `active` is not here: it is table-dependent.
const FLAG_FIELDS: Partial<Record<AuditTable, string>> = {
  customers: 'is_regular',
  plans: 'is_custom_price',
};

const GENERIC: Record<AuditAction, string> = {
  create: 'audit.summary.create',
  update: 'audit.summary.update',
  delete: 'audit.summary.delete',
  void: 'audit.summary.void',
  restore: 'audit.summary.restore',
};

interface Phrases {
  actor: string;
  record: string;
  type: string;
  detail: RecordDetail;
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

function actorName(entry: AuditEntry, ctx: AuditFieldContext): string {
  const known = entry.actorUserId ? ctx.lookups.user(entry.actorUserId) : null;
  return known ?? entry.actorUsername ?? ctx.t('audit.summary.actor_unknown');
}

function changeOf(entry: AuditEntry, field: string): AuditChange | undefined {
  return entry.changes.find((c) => c.field === field);
}

/** The record's noun, named by its `kind` where the table has kinds. */
function recordType(entry: AuditEntry, ctx: AuditFieldContext): string {
  const kind = recordKind(entry);
  const key = kind ? KIND_TYPE[entry.table]?.[kind] : undefined;
  return key ? ctx.t(key) : tableLabel(ctx.t, entry.table).toLowerCase();
}

/**
 * The record as a noun phrase, ARTICLE INCLUDED — "the March 2026 bill", "a
 * payment of 30.00 $", "a bill". The article has to live here: a create says "a
 * new X", and a record the trail cannot name is "a X", never "the X".
 */
function recordPhrase(
  entry: AuditEntry,
  ctx: AuditFieldContext,
  detail: RecordDetail,
  type: string,
): string {
  const kind = recordKind(entry);
  const style =
    (kind ? KIND_STYLE[entry.table]?.[kind] : undefined) ??
    RECORD_STYLE[entry.table] ??
    'type_first';
  const fresh = entry.action === 'create' && style !== 'of_detail';
  const named = !detail.text
    ? ctx.t(fresh ? 'audit.summary.record.bare_new' : 'audit.summary.record.bare', { type })
    : ctx.t(`audit.summary.record.${style}${fresh ? '_new' : ''}`, {
      type,
      detail: bold(detail.text),
    });

  const plan = recordPlan(entry, ctx);
  if (!plan) return named;
  return ctx.t('audit.summary.record.with_plan', { record: named, plan: bold(plan) });
}

// A field label mid-sentence, not as a table heading — "Voided at" reads as a name.
function fieldName(field: string, ctx: AuditFieldContext): string {
  return formatFieldLabel(field, ctx).toLowerCase();
}

/** The changed columns as prose: one name, two joined, or two plus a count. */
function fieldsList(changes: AuditChange[], ctx: AuditFieldContext): string {
  const labels = changes.map((c) => fieldName(c.field, ctx));
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) {
    return ctx.t('audit.summary.fields_two', { first: labels[0], second: labels[1] });
  }
  return ctx.t('audit.summary.fields_more', {
    list: labels.slice(0, 2).join(ctx.t('audit.summary.fields_sep')),
    count: labels.length - 2,
  });
}

// Columns that must be SPOKEN, not diffed; never names the subject (caller does).
function specialSentence(entry: AuditEntry, ctx: AuditFieldContext, p: Phrases): string | null {
  const { t } = ctx;
  const { actor, record, type, detail } = p;

  if (entry.table === 'tenant_settings') {
    const value = changeOf(entry, 'value')?.after ?? entry.context.value;
    return t('audit.summary.special.setting', {
      field: formatFieldLabel('value', ctx),
      actor,
      after: bold(formatField('value', value, ctx)),
    });
  }

  if (entry.table === 'collections' && entry.action === 'create') {
    return t('audit.summary.special.payment_received', { actor, record });
  }

  if (entry.table === 'skipped_months' && detail.text) {
    const flip = changeOf(entry, 'skipped')?.after ?? entry.context.skipped;
    const off = flip === false || (flip === undefined && entry.action === 'restore');
    return t(`audit.summary.special.${off ? 'unskipped' : 'skipped'}`, {
      actor,
      detail: bold(detail.text),
    });
  }

  if (entry.table === 'customer_plans' && detail.text) {
    const cancelled = changeOf(entry, 'cancelled_at');
    const removed = entry.action === 'delete' || (cancelled && !isBlank(cancelled.after));
    if (removed) {
      return t('audit.summary.special.unsubscribed', { actor, detail: bold(detail.text) });
    }
    if (entry.action === 'create' || (cancelled && isBlank(cancelled.after))) {
      return t('audit.summary.special.subscribed', { actor, detail: bold(detail.text) });
    }
  }

  const unvoided = changeOf(entry, 'voided_at');
  const writeOff = changeOf(entry, 'written_off_at');

  // Money on a dead bill clears BOTH death marks and re-stamps issued_at
  // (reviveTargetBill) — a diff of that reads as a void, the exact opposite.
  const revived =
    (unvoided && isBlank(unvoided.after) && !isBlank(unvoided.before)) ||
    (writeOff && isBlank(writeOff.after) && !isBlank(writeOff.before));
  if (revived) return t('audit.summary.special.revived', { actor, record });

  if (writeOff) {
    const key = isBlank(writeOff.after) ? 'write_off_undone' : 'written_off';
    return t(`audit.summary.special.${key}`, { actor, record });
  }

  if (changeOf(entry, 'password')) {
    return t('audit.summary.special.password', { actor, record });
  }

  if (entry.table === 'tenants') {
    const tier = changeOf(entry, 'tier_id');
    if (tier) {
      return t('audit.summary.special.tier_changed', {
        actor,
        record,
        after: bold(formatField('tier_id', tier.after, ctx)),
      });
    }
  }

  const flag = FLAG_FIELDS[entry.table];
  const flagChange = flag ? changeOf(entry, flag) : undefined;
  if (flag && flagChange) {
    const key = flagChange.after === true ? `${flag}_on` : `${flag}_off`;
    return t(`audit.summary.special.${key}`, { actor, record });
  }

  const active = changeOf(entry, 'active');
  if (active) {
    const on = active.after === true;
    const key =
      entry.table === 'customers'
        ? on
          ? 'uncancelled'
          : 'cancelled'
        : on
          ? 'activated'
          : 'deactivated';
    return t(`audit.summary.special.${key}`, { actor, record });
  }

  if (entry.table === 'stock_movements' && entry.changes.length === 1) {
    const c = entry.changes[0];
    return t('audit.summary.special.stock_edit', {
      actor,
      field: fieldName(c.field, ctx),
      before: isolate(formatField(c.field, c.before, ctx)),
      after: bold(formatField(c.field, c.after, ctx)),
    });
  }

  if (entry.changes.length === 1 && detail.field && entry.changes[0].field === detail.field) {
    const c = entry.changes[0];
    return t('audit.summary.special.renamed', {
      actor,
      type,
      before: isolate(formatField(c.field, c.before, ctx)),
      after: bold(formatField(c.field, c.after, ctx)),
    });
  }

  return null;
}

function genericSentence(entry: AuditEntry, ctx: AuditFieldContext, p: Phrases): string {
  const { t } = ctx;
  if (entry.action !== 'update' || entry.changes.length === 0) {
    return t(GENERIC[entry.action], { actor: p.actor, record: p.record });
  }

  if (entry.changes.length === 1) {
    const c = entry.changes[0];
    return t('audit.summary.update_one', {
      actor: p.actor,
      field: fieldName(c.field, ctx),
      record: p.record,
      before: isolate(formatField(c.field, c.before, ctx)),
      after: bold(formatField(c.field, c.after, ctx)),
    });
  }

  return t('audit.summary.update_many', {
    actor: p.actor,
    fields: fieldsList(entry.changes, ctx),
    record: p.record,
  });
}

/** One entry as a sentence in plain and bold runs — bold marks the nouns. */
export function buildAuditSummary(
  entry: AuditEntry,
  ctx: AuditFieldContext,
  options: AuditSummaryOptions = {},
): SentencePart[] {
  const type = recordType(entry, ctx);
  const detail = recordDetail(entry, ctx);
  const phrases: Phrases = {
    actor: bold(actorName(entry, ctx)),
    record: recordPhrase(entry, ctx, detail, type),
    type,
    detail,
  };

  const sentence = specialSentence(entry, ctx, phrases) ?? genericSentence(entry, ctx, phrases);
  const subject =
    options.showSubject !== false && entry.table !== 'customers' ? entry.subject : null;
  if (!subject) return toParts(sentence);

  const key = entry.table === 'collections' ? 'from_subject' : 'for_subject';
  return toParts(ctx.t(`audit.summary.${key}`, { sentence, subject: bold(subject) }));
}
