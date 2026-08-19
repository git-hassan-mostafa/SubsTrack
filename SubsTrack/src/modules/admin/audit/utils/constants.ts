import type { AuditTable } from '@/src/core/types';

/**
 * The tables the app records a trail for, in the order the filter lists them
 * (money first — that's what disputes are about).
 *
 * Deliberately NOT every table: `sale_items` is covered by its parent sale, and
 * `custom_debts` / `debt_payments` are append-only + voidable, so the Debts view is
 * their own history. `stock_movements` is here for its EDITS only — the ledger row
 * already shows who added the stock, so the insert writes nothing; a quantity or
 * cost changed after the fact is what nothing else would remember.
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
  'stock_movements',
  'plans',
  'users',
  'branches',
  'currencies',
  'tenant_settings',
  'tenants',
];
