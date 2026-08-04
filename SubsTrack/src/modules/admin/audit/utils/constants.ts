import type { AuditTable } from '@/src/core/types';

/**
 * The tables the app records a trail for, in the order the filter lists them
 * (money first — that's what disputes are about).
 *
 * Deliberately NOT every table: `sale_items` is covered by its parent sale, and
 * `stock_movements` is already an append-only ledger with its own history UI, so
 * auditing either would duplicate itself. See docs/features.md → Audit Trail.
 */
export const AUDITED_TABLES: AuditTable[] = [
  'payments',
  'sales',
  'debt_payments',
  'custom_debts',
  'customers',
  'customer_plans',
  'skipped_months',
  'products',
  'plans',
  'users',
  'branches',
  'currencies',
  'tenant_settings',
  'tenants',
];
