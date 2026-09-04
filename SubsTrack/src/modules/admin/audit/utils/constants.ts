import type { AuditTable } from '@/src/core/types';

export const CUSTOMER_HISTORY_TABLES: AuditTable[] = [
  'customers',
  'customer_plans',
  'charges',
  'collections',
  'skipped_months',
];

export const AUDITED_TABLES: AuditTable[] = [
  'charges',
  'collections',
  'sales',
  'customers',
  'customer_plans',
  'skipped_months',
  'products',
  'services',
  'stock_movements',
  'plans',
  'users',
  'branches',
  'currencies',
  'tenant_settings',
  'tenants',
];
