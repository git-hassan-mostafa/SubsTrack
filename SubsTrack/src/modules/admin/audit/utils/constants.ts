import type { AuditTable } from '@/src/core/types';

/**
 * The tables the app records a trail for, in the order the filter lists them
 * (money first — that's what disputes are about).
 *
 * Deliberately NOT every table: `sale_items` is covered by its parent sale, and
 * `stock_movements` is already an append-only ledger with its own history UI, so
 * auditing either would duplicate itself. `custom_debts` / `debt_payments` are out
 * for the same reason — append-only + voidable, so the Debts view is the history.
 * See docs/features.md → Audit Trail.
 */
/**
 * What the customer History sheet counts as "this customer's story": the profile
 * row, its service lines, and the month payments / skips on them.
 *
 * `sales` is left out even though its entries carry the same customer — a sale is
 * a one-off purchase with its own panel on the customer screen, and mixing the two
 * buries the subscription timeline this sheet exists to show.
 */
export const CUSTOMER_HISTORY_TABLES: AuditTable[] = [
  'customers',
  'customer_plans',
  'payments',
  'skipped_months',
];

export const AUDITED_TABLES: AuditTable[] = [
  'payments',
  'sales',
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
