import type { AuditEntry } from '@/src/core/types';
import { billingMonthLabel } from '@/src/core/utils/billingMonth';
import { receiptId } from '@/src/core/utils/receiptId';
import { formatField } from './format';
import type { AuditFieldContext } from './valueDisplay';

// `field` is carried so an edit OF it reads "renamed X to Y" — see gotcha #132.
export interface RecordDetail {
  text: string | null;
  field: string | null;
}

const NONE: RecordDetail = { text: null, field: null };

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

function first(...tries: RecordDetail[]): RecordDetail {
  return tries.find((d) => d.text !== null) ?? NONE;
}

function detailOf(entry: AuditEntry, ctx: AuditFieldContext): RecordDetail {
  const row: Record<string, unknown> = { ...entry.snapshot, ...entry.context };

  const text = (field: string): RecordDetail =>
    isBlank(row[field]) ? NONE : { text: String(row[field]), field };
  const display = (field: string): RecordDetail =>
    isBlank(row[field]) ? NONE : { text: formatField(field, row[field], ctx), field };
  const month = (field: string): RecordDetail =>
    isBlank(row[field]) ? NONE : { text: billingMonthLabel(String(row[field]), true), field };

  switch (entry.table) {
    case 'charges':
      return row.kind === 'month'
        ? first(month('billing_month'), display('amount'))
        : first(text('description'), display('amount'));
    case 'collections':
      return display('amount');
    case 'sales':
      return { text: `#${receiptId(entry.recordId)}`, field: null };
    case 'customers':
      return entry.subject ? { text: entry.subject, field: 'name' } : text('name');
    case 'users':
      return first(text('full_name'), text('username'));
    case 'currencies':
      return first(text('code'), text('name'));
    case 'skipped_months':
      return month('billing_month');
    case 'customer_plans':
      return display('plan_id');
    case 'stock_movements':
      return NONE;
    default:
      return text('name');
  }
}

/**
 * Never falls back to `entry.label` — that is a raw '·'-joined column dump, and
 * splicing it into prose reads worse than saying nothing (see gotcha #132).
 */
export function recordDetail(entry: AuditEntry, ctx: AuditFieldContext): RecordDetail {
  return detailOf(entry, ctx);
}
