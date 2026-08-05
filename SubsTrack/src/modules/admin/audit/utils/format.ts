import type { TFunction } from 'i18next';
import type { AuditAction, AuditEntry, AuditTable } from '@/src/core/types';
import { formatDateTime, isValidDateString } from '@/src/core/utils/date';
import { displayLabel, displayValue, type AuditFieldContext } from './valueDisplay';

/** Human label for a table name, falling back to the raw name for anything new. */
export function tableLabel(t: TFunction, table: AuditTable | string): string {
  const key = `audit.table.${table}`;
  const label = t(key);
  return label === key ? table : label;
}

/** Human label for a column name, falling back to the raw name. */
export function fieldLabel(t: TFunction, field: string): string {
  const key = `audit.field.${field}`;
  const label = t(key);
  return label === key ? field : label;
}

export function actionLabel(t: TFunction, action: AuditAction): string {
  return t(`audit.action.${action}`);
}

/**
 * Render one field's value: the per-column display registry first (enum labels,
 * ids resolved to names — see valueDisplay.ts), the generic rendering otherwise.
 * A column with no registered display therefore still renders, unchanged.
 */
export function formatField(field: string, value: unknown, ctx: AuditFieldContext): string {
  return displayValue(field, value, ctx) ?? formatValue(ctx.t, value, ctx.locale);
}

/**
 * The Record row's one-liner. `entry.label` is frozen at write time from raw
 * columns; a table may render it better at read time (a setting's name instead of
 * `UnpaidStartRule · month_start`). Built from the row's OWN columns only, so it
 * never needs an id lookup.
 */
export function recordLabel(t: TFunction, entry: AuditEntry): string | null {
  return displayLabel(t, entry) ?? entry.label;
}

/**
 * Render a raw DB value for display. Deliberately column-agnostic: the trail must
 * stay readable for ANY column, including ones added after this was written, so
 * there is no per-field casing here beyond the obvious shapes — that belongs in
 * the display registry (valueDisplay.ts).
 */
export function formatValue(t: TFunction, value: unknown, locale = 'en-US'): string {
  if (value === null || value === undefined || value === '') return t('audit.empty_value');
  if (typeof value === 'boolean') return value ? t('common.yes') : t('common.no');
  if (typeof value === 'number') return String(value);
  // A structured value has no useful one-line rendering, and dumping its JSON
  // filled the sheet with unreadable text. Say how much there is instead.
  if (Array.isArray(value)) return t('audit.items_count', { count: value.length });
  if (typeof value === 'object') return t('audit.structured_value');

  const s = String(value);
  // ISO timestamp → local date+time. `isValidDateString` only accepts YYYY-MM-DD,
  // so check the full timestamp shape separately.
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return formatDateTime(s, locale);
  if (isValidDateString(s)) return s;
  return s;
}
