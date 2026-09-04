export type ColType =
  | 'text'
  | 'int'
  | 'num'
  | 'bool'
  | 'json';

export interface TableSpec {
  name: string;
  columns: Record<string, ColType>;
  constraints?: string[];
  generated?: string[];
  scope: 'tenant' | 'global';
  pushOnly?: boolean;
  appendOnly?: boolean;
  pullDays?: number;
}

export const AUDIT_LOCAL_DAYS = 30;

export const TABLES: TableSpec[] = [
  {
    name: 'tenants',
    scope: 'tenant',
    columns: {
      id: 'text', name: 'text', tenant_code: 'text', active: 'bool',
      tier_id: 'text', tier_upgraded_at: 'text', created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'tier_plans',
    scope: 'global',
    columns: {
      id: 'text', code: 'text', name: 'text', sort_order: 'int',
      max_customers: 'int', max_users: 'int', max_plans: 'int', max_branches: 'int',
      max_currencies: 'int', max_products: 'int',
      multi_currency_enabled: 'bool', multi_month_plans_enabled: 'bool',
      price_monthly_usd: 'num', price_yearly_usd: 'num',
      active: 'bool', created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'currencies',
    scope: 'tenant',
    columns: {
      id: 'text', tenant_id: 'text', code: 'text', name: 'text', symbol: 'text',
      rate_per_usd: 'num', decimals: 'int', active: 'bool', created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'branches',
    scope: 'tenant',
    columns: {
      id: 'text', tenant_id: 'text', name: 'text', active: 'bool',
      created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'users',
    scope: 'tenant',
    columns: {
      id: 'text', username: 'text', full_name: 'text', phone_number: 'text', role: 'text',
      active: 'bool', tenant_id: 'text', branch_id: 'text', created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'plans',
    scope: 'tenant',
    columns: {
      id: 'text', name: 'text', price: 'num', is_custom_price: 'bool', duration_months: 'int',
      currency_id: 'text', branch_id: 'text', tenant_id: 'text', created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'customers',
    scope: 'tenant',
    columns: {
      id: 'text', name: 'text', phone_number: 'text', address: 'text', area: 'text', notes: 'text',
      location_url: 'text', active: 'bool', is_regular: 'bool', branch_id: 'text', tenant_id: 'text',
      cancelled_at: 'text', created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'customer_plans',
    scope: 'tenant',
    columns: {
      id: 'text', customer_id: 'text', plan_id: 'text', start_date: 'text', cancelled_at: 'text',
      active: 'bool', custom_price: 'num', custom_currency_id: 'text',
      tenant_id: 'text', created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'skipped_months',
    scope: 'tenant',
    columns: {
      id: 'text', tenant_id: 'text', customer_id: 'text', customer_plan_id: 'text',
      billing_month: 'text', skipped: 'bool', note: 'text', skipped_by_user_id: 'text',
      created_at: 'text', updated_at: 'text',
    },
    constraints: ['UNIQUE (customer_plan_id, billing_month)'],
  },
  {
    name: 'products',
    scope: 'tenant',
    columns: {
      id: 'text', tenant_id: 'text', branch_id: 'text', name: 'text', description: 'text',
      price: 'num', currency_id: 'text',
      cost_price: 'num', cost_currency_id: 'text',
      active: 'bool', created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'services',
    scope: 'tenant',
    columns: {
      id: 'text', tenant_id: 'text', branch_id: 'text', name: 'text', description: 'text',
      price: 'num', currency_id: 'text',
      active: 'bool', created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'sales',
    scope: 'tenant',
    columns: {
      id: 'text', tenant_id: 'text', branch_id: 'text', items_summary: 'text',
      customer_id: 'text', recorded_by_user_id: 'text',
      total_amount: 'num',
      currency_id: 'text', rate_per_usd_snapshot: 'num', sold_at: 'text',
      voided_at: 'text', voided_by: 'text',
      void_reason: 'text', notes: 'text',
      created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'sale_items',
    scope: 'tenant',
    columns: {
      id: 'text', sale_id: 'text', tenant_id: 'text',
      line_type: 'text', product_id: 'text', service_id: 'text',
      item_name_snapshot: 'text', quantity: 'int', unit_amount: 'num',
      voided_at: 'text', created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'stock_movements',
    scope: 'tenant',
    columns: {
      id: 'text', tenant_id: 'text', product_id: 'text', quantity_delta: 'int',
      reason: 'text', sale_id: 'text',
      unit_cost: 'num', currency_id: 'text', rate_per_usd_snapshot: 'num',
      note: 'text', recorded_by_user_id: 'text',
      occurred_at: 'text', voided_at: 'text', voided_by: 'text',
      created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'charges',
    scope: 'tenant',
    columns: {
      id: 'text', tenant_id: 'text', branch_id: 'text', customer_id: 'text',
      kind: 'text',
      customer_plan_id: 'text', billing_month: 'text', duration_months: 'int',
      plan_id: 'text',
      sale_id: 'text',
      description: 'text',
      amount: 'num', currency_id: 'text', rate_per_usd_snapshot: 'num',
      issued_at: 'text', due_date: 'text',
      recorded_by_user_id: 'text', notes: 'text',
      voided_at: 'text', voided_by: 'text', void_reason: 'text',
      written_off_at: 'text', written_off_by: 'text', write_off_reason: 'text',
      created_at: 'text', updated_at: 'text',
    },
    constraints: ['UNIQUE (customer_plan_id, billing_month)'],
  },
  {
    name: 'collections',
    scope: 'tenant',
    columns: {
      id: 'text', tenant_id: 'text', branch_id: 'text', customer_id: 'text',
      amount: 'num', currency_id: 'text', rate_per_usd_snapshot: 'num',
      received_at: 'text', received_by_user_id: 'text', notes: 'text',
      kind: 'text',
      voided_at: 'text', voided_by: 'text', void_reason: 'text',
      held_by_user_id: 'text', remitted_at: 'text', remitted_by: 'text',
      created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'collection_items',
    scope: 'tenant',
    columns: {
      id: 'text', tenant_id: 'text', collection_id: 'text', charge_id: 'text',
      amount: 'num',
      created_at: 'text', updated_at: 'text',
    },
    constraints: ['UNIQUE (collection_id, charge_id)'],
  },
  {
    name: 'expenses',
    scope: 'tenant',
    columns: {
      id: 'text', tenant_id: 'text', branch_id: 'text',
      category: 'text', description: 'text',
      amount: 'num', currency_id: 'text', rate_per_usd_snapshot: 'num',
      recorded_by_user_id: 'text', incurred_at: 'text',
      voided_at: 'text', voided_by: 'text', void_reason: 'text', notes: 'text',
      created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'app_options',
    scope: 'global',
    columns: {
      id: 'text', key: 'text', value: 'text', description: 'text',
      created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'tenant_settings',
    scope: 'tenant',
    columns: {
      id: 'text', tenant_id: 'text', key: 'text', value: 'text',
      created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'exception_logs',
    scope: 'tenant',
    pushOnly: true,
    appendOnly: true,
    columns: {
      id: 'text', tenant_id: 'text', user_id: 'text', username: 'text',
      source: 'text', message: 'text', stack: 'text', context: 'text',
      occurred_at: 'text', created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'audit_logs',
    scope: 'tenant',
    appendOnly: true,
    pullDays: AUDIT_LOCAL_DAYS,
    columns: {
      id: 'text', tenant_id: 'text', branch_id: 'text',
      table_name: 'text', record_id: 'text', action: 'text',
      before_data: 'json', after_data: 'json', changed: 'json',
      label: 'text', subject: 'text', subject_id: 'text',
      actor_user_id: 'text', actor_username: 'text',
      occurred_at: 'text', created_at: 'text', updated_at: 'text',
    },
  },
];

export const TABLE_BY_NAME: Record<string, TableSpec> = Object.fromEntries(
  TABLES.map((t) => [t.name, t]),
);

export const PUSH_WAVES: readonly (readonly string[])[] = [
  ['tenants', 'tier_plans', 'app_options'],
  ['tenant_settings', 'currencies', 'branches'],
  ['users', 'plans', 'customers', 'products', 'services'],
  ['customer_plans', 'sales', 'expenses', 'collections',
    'exception_logs', 'audit_logs'],
  ['charges', 'skipped_months', 'sale_items', 'stock_movements'],
  ['collection_items'],
];

export const SYNC_TABLES: readonly string[] = PUSH_WAVES.flat();
