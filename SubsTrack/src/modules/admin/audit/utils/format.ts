import type { TFunction } from 'i18next';
import type { AuditAction, AuditTable } from '@/src/core/types';
import { formatDateTime, isValidDateString } from '@/src/core/utils/date';

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
 * Columns holding a USER id. A raw UUID is unreadable and, on a trail whose whole
 * point is "who did this", useless — so these are resolved to a username for
 * display (see `formatField`). Record ids (`customer_id`, `plan_id`, …) are NOT in
 * here on purpose: they identify the row the entry already names, and a deleted
 * record has no name left to resolve to.
 */
const PERSON_FIELDS = new Set([
  'voided_by',
  'remitted_by',
  'received_by_user_id',
  'skipped_by_user_id',
  'recorded_by_user_id',
  'actor_user_id',
]);

/** Resolves a user id to a display name; returns null when unknown. */
export type UserLookup = (userId: string) => string | null;

/**
 * Render one field's value, resolving a person id to their name when the field
 * holds one. Falls back to `formatValue` for every other column.
 *
 * The id is resolved at READ time, never stored: a name frozen at write time would
 * go stale on a rename, and the id must survive in the row either way.
 */
export function formatField(
  t: TFunction,
  field: string,
  value: unknown,
  locale = 'en-US',
  lookupUser?: UserLookup,
): string {
  if (PERSON_FIELDS.has(field) && typeof value === 'string' && value !== '') {
    // An unresolvable id means a deleted user (or a staff list not loaded) — say so
    // rather than showing a UUID nobody can act on.
    return lookupUser?.(value) ?? t('audit.deleted_user');
  }
  return formatValue(t, value, locale);
}

/**
 * Render a raw DB value for display. Deliberately plain: the trail must stay
 * readable for ANY column, including ones added after this was written, so there
 * is no per-field special casing beyond the obvious shapes.
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
