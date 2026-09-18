import { TABLES, TABLE_BY_NAME } from '@/src/core/offline/db/tables';
import {
  BACKUP_TABLE_ORDER,
  rowsPerStatement,
} from '@/src/core/offline/backup/tableOrder';
import { validateBackup } from '@/src/core/offline/backup/validate';
import type { BackupRow, BackupSession } from '@/src/core/offline/backup/types';

const TENANT = 't-1';
const USER = 'u-1';

const session: BackupSession = {
  tenantId: TENANT,
  tenantCode: 'ACME',
  tenantName: 'Acme',
  userId: USER,
  username: 'hassan',
  branchId: null,
};

// Which table each child's foreign keys point at, as the server enforces them.
const PARENTS: Record<string, string[]> = {
  customers: ['branches'],
  users: ['branches'],
  plans: ['branches', 'currencies'],
  products: ['branches', 'currencies'],
  services: ['branches', 'currencies'],
  customer_plans: ['customers', 'plans'],
  sales: ['customers', 'branches'],
  expenses: ['branches', 'currencies'],
  collections: ['customers', 'branches'],
  charges: ['customers', 'customer_plans', 'sales', 'plans'],
  skipped_months: ['customers', 'customer_plans'],
  sale_items: ['sales', 'products', 'services'],
  stock_movements: ['products', 'sales'],
  collection_items: ['collections', 'charges'],
};

describe('TC-BK-07 the restore writes tables in an order that cannot error', () => {
  it('covers every table exactly once', () => {
    const names = TABLES.map((t) => t.name);
    expect([...BACKUP_TABLE_ORDER].sort()).toEqual([...names].sort());
    expect(new Set(BACKUP_TABLE_ORDER).size).toBe(BACKUP_TABLE_ORDER.length);
  });

  it('places every parent before its children', () => {
    const at = Object.fromEntries(BACKUP_TABLE_ORDER.map((n, i) => [n, i]));
    for (const [child, parents] of Object.entries(PARENTS)) {
      for (const parent of parents) {
        expect(`${parent} before ${child}: ${at[parent] < at[child]}`).toBe(
          `${parent} before ${child}: true`,
        );
      }
    }
  });
});

describe('TC-BK-08 batched INSERTs stay under the bound-parameter ceiling', () => {
  it('never binds more than 999 parameters for any table', () => {
    for (const spec of TABLES) {
      const columns = Object.keys(spec.columns).length;
      const rows = rowsPerStatement(columns);
      expect(rows).toBeGreaterThanOrEqual(1);
      expect(rows * (columns + 1)).toBeLessThanOrEqual(999);
    }
  });
});

describe('TC-BK-09 a streamed export parses back into the same rows', () => {
  function streamedFile(tables: Record<string, BackupRow[]>): string {
    const header = {
      format: 'substrack-local-backup',
      version: 1,
      exportedAt: '2026-09-18T10:00:00.000Z',
      app: { version: '1.0.0', runtimeVersion: null },
      tenant: { id: TENANT, code: 'ACME', name: 'Acme' },
      branchScope: '__all__',
      user: { id: USER, username: 'hassan' },
    };
    const headerJson = JSON.stringify(header);
    let text = headerJson.slice(0, headerJson.length - 1) + ',"tables":{';
    let first = true;
    for (const name of BACKUP_TABLE_ORDER) {
      const columns = Object.keys(TABLE_BY_NAME[name].columns);
      text += `${first ? '' : ','}${JSON.stringify(name)}:[`;
      first = false;
      text += (tables[name] ?? [])
        .map((raw) => {
          const out: Record<string, unknown> = {};
          for (const c of columns) out[c] = raw[c] === undefined ? null : raw[c];
          return JSON.stringify(out);
        })
        .join(',');
      text += ']';
    }
    return text + '}}';
  }

  it('survives quotes, commas, nulls and TEXT decimals', () => {
    const tables: Record<string, BackupRow[]> = {
      tenants: [{ id: TENANT, name: 'Acme', tenant_code: 'ACME', active: 1 }],
      users: [{ id: USER, tenant_id: TENANT, username: 'hassan', branch_id: null }],
      customers: [
        { id: 'c1', tenant_id: TENANT, name: 'Ali', active: 1 },
        { id: 'c2', tenant_id: TENANT, name: 'O\'Brien, "Jr"\nline2', active: 0 },
      ],
      charges: [
        {
          id: 'ch1',
          tenant_id: TENANT,
          kind: 'month',
          customer_plan_id: 'l1',
          billing_month: '2026-09-01',
          amount: '25.50',
        },
        {
          id: 'ch2',
          tenant_id: TENANT,
          kind: 'sale',
          customer_plan_id: null,
          billing_month: null,
          amount: '10.00',
        },
      ],
      app_options: [{ id: 'o1', key: 'LiraRate', value: '90000' }],
    };

    const result = validateBackup(JSON.parse(streamedFile(tables)), session);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.totalRows).toBe(7);
    expect(result.backup.tables.customers[1].name).toBe('O\'Brien, "Jr"\nline2');
    expect(result.backup.tables.charges[0].amount).toBe('25.50');
    expect(result.backup.tables.charges[1].billing_month).toBeNull();
    expect(result.backup.tables.customers[1].active).toBe(0);
  });

  it('writes every declared column, so a sparse row still binds in full', () => {
    const tables: Record<string, BackupRow[]> = {
      tenants: [{ id: TENANT }],
      users: [{ id: USER, tenant_id: TENANT }],
      customers: [{ id: 'c1', tenant_id: TENANT }],
    };
    const result = validateBackup(JSON.parse(streamedFile(tables)), session);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = result.backup.tables.customers[0];
    expect(Object.keys(row).sort()).toEqual(
      Object.keys(TABLE_BY_NAME.customers.columns).sort(),
    );
  });
});
