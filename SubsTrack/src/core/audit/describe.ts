import type { AuditTable } from '@/src/core/types';

/**
 * A short, frozen one-liner identifying the touched record — the audit row's
 * `label`. Frozen on purpose (like `sales.items_summary`): the trail must stay
 * readable after the row itself is deleted or renamed.
 *
 * Deliberately built only from columns the row itself carries. Names that live on
 * another table (the customer behind a payment) are resolved by the UI when it
 * can, because a deleted customer would leave a dangling id here forever.
 */
export function describeAudit(table: AuditTable, row: Record<string, unknown> | null): string | null {
  if (!row) return null;
  const s = (k: string): string | null => {
    const v = row[k];
    return v === null || v === undefined || v === '' ? null : String(v);
  };
  const join = (...parts: (string | null)[]): string | null => {
    const kept = parts.filter((p): p is string => p !== null);
    return kept.length > 0 ? kept.join(' · ') : null;
  };

  switch (table) {
    case 'payments':
      return join(s('billing_month'), s('amount_paid'));
    case 'sales':
      return join(s('items_summary'), s('total_amount'));
    case 'custom_debts':
      return join(s('description'), s('amount'));
    case 'debt_payments':
      return s('amount');
    case 'customers':
    case 'plans':
    case 'products':
    case 'branches':
    case 'users':
      return s('name') ?? s('username');
    case 'currencies':
      return join(s('code'), s('name'));
    case 'customer_plans':
      return s('start_date');
    case 'skipped_months':
      return s('billing_month');
    case 'tenant_settings':
      return join(s('key'), s('value'));
    case 'tenants':
      return s('name');
    default:
      return null;
  }
}
