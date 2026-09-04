import type { TFunction } from 'i18next';
import type { AuditTable } from '@/src/core/types';
import { TENANT_SETTING_KEYS } from '@/src/modules/admin/tenant-settings/utils/constants';


/** Id → display name. `null` = not found (deleted, or the list isn't loaded). */
export interface AuditLookups {
  user: (id: string) => string | null;
  currency: (id: string) => string | null;
  branch: (id: string) => string | null;
}

export interface AuditFieldContext {
  t: TFunction;
  locale: string;
  table: AuditTable | string;
  row: Record<string, unknown>;
  lookups: AuditLookups;
}

/** The text to show for one value, or `null` to fall back to the generic rendering. */
export type AuditValueFormatter = (value: unknown, ctx: AuditFieldContext) => string | null;

/** NULL, undefined and '' are all "no value" here, as everywhere in the trail. */
function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}


/** Maps a column's known raw values to i18n keys; an unmapped value falls through. */
function enumLabel(keys: Record<string, string>): AuditValueFormatter {
  return (value, { t }) => {
    const key = typeof value === 'string' ? keys[value] : undefined;
    return key ? t(key) : null;
  };
}

/**
 * Resolves an id column to a name. `blank` names what NULL means on this column
 * (null currency = USD, null branch = shared) — "(empty)" says nothing there.
 */
function idRef(
  kind: keyof AuditLookups,
  opts: { blank?: string; missing?: string } = {},
): AuditValueFormatter {
  return (value, { t, lookups }) => {
    if (isBlank(value)) return opts.blank ? t(opts.blank) : null;
    return lookups[kind](String(value)) ?? t(opts.missing ?? 'audit.deleted_record');
  };
}

const person = idRef('user', { missing: 'audit.deleted_user' });
const currency = idRef('currency', { blank: 'audit.base_currency' });


const SETTINGS: Record<string, { label: string; value: AuditValueFormatter }> = {
  [TENANT_SETTING_KEYS.unpaidStartRule]: {
    label: 'audit.setting.UnpaidStartRule',
    value: enumLabel({
      month_start: 'tenant_settings.unpaid_rule_month_start',
      customer_start_day: 'tenant_settings.unpaid_rule_customer_start_day',
    }),
  },
  [TENANT_SETTING_KEYS.displayCurrencyId]: {
    label: 'audit.setting.DisplayCurrencyId',
    value: currency,
  },
};

function setting(key: unknown) {
  return typeof key === 'string' ? SETTINGS[key] : undefined;
}


const DISPLAY: Record<string, AuditValueFormatter> = {
  '*.voided_by': person,
  '*.remitted_by': person,
  '*.held_by_user_id': person,
  '*.received_by_user_id': person,
  '*.skipped_by_user_id': person,
  '*.recorded_by_user_id': person,
  '*.actor_user_id': person,
  '*.currency_id': currency,
  '*.custom_currency_id': currency,
  '*.branch_id': idRef('branch', { blank: 'branches.unassigned' }),

  'users.role': enumLabel({ admin: 'users.admin', user: 'users.user', superadmin: 'users.super' }),
  'users.branch_id': idRef('branch', { blank: 'branches.tenant_wide_admin' }),
  'plans.branch_id': idRef('branch', { blank: 'branches.shared_all_branches' }),
  'products.branch_id': idRef('branch', { blank: 'branches.shared_all_branches' }),

  'tenant_settings.key': (value, { t }) => {
    const s = setting(value);
    return s ? t(s.label) : null;
  },
  'tenant_settings.value': (value, ctx) => setting(ctx.row.key)?.value(value, ctx) ?? null,
};

const FIELD_LABELS: Record<string, (ctx: AuditFieldContext) => string | null> = {
  'tenant_settings.value': ({ t, row }) => {
    const s = setting(row.key);
    return s ? t(s.label) : null;
  },
};

const HIDDEN_COLUMNS = new Set(['id', 'tenant_id', 'created_at', 'updated_at', 'balance']);

function formatterFor(table: AuditTable | string, field: string): AuditValueFormatter | undefined {
  return DISPLAY[`${table}.${field}`] ?? DISPLAY[`*.${field}`];
}

/** True for a column the trail never shows, in a diff or a whole-row snapshot. */
export function isHiddenColumn(field: string): boolean {
  return HIDDEN_COLUMNS.has(field);
}

/**
 * Whether a whole-row snapshot (create / delete) lists this column. Ids are noise
 * there — a UUID says nothing — unless the registry can turn one into a name.
 */
export function showsColumn(table: AuditTable | string, field: string): boolean {
  if (isHiddenColumn(field)) return false;
  return !field.endsWith('_id') || Boolean(formatterFor(table, field));
}

/** The registry's rendering for one column, or `null` when it has nothing to say. */
export function displayValue(field: string, value: unknown, ctx: AuditFieldContext): string | null {
  return formatterFor(ctx.table, field)?.(value, ctx) ?? null;
}

/** The registry's name for one column, or `null` to use the generic field label. */
export function displayFieldLabel(field: string, ctx: AuditFieldContext): string | null {
  return FIELD_LABELS[`${ctx.table}.${field}`]?.(ctx) ?? null;
}
