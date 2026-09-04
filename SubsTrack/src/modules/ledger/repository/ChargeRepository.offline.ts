import type { BranchFilter } from '@/src/core/constants';
import type { DbCharge, DbChargeBalance, DbCustomer, DbCustomerPlan, DbPlan, DbSale } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { insertDirty, updateDirty } from '@/src/core/offline/db/dml';
import { nowIso } from '@/src/core/offline/ids';
import type {
  CreateChargePayload,
  DbChargeWithPaid,
  FindChargesOptions,
  IChargeRepository,
  UpdateChargePayload,
} from './IChargeRepository';

const PAID_SUM =
  `COALESCE(SUM(CASE WHEN co.id IS NOT NULL AND co.voided_at IS NULL
                     THEN CAST(i.amount AS REAL) ELSE 0 END), 0)`;
const PAID_JOIN =
  `LEFT JOIN collection_items i ON i.charge_id = c.id
   LEFT JOIN collections co ON co.id = i.collection_id`;

/**
 * SQLite-backed bills. Reproduces
 * `'*, customers(*), customer_plans(*, plans(*)), sales(*)'`.
 *
 * The `charge_balances` view has no local twin: the mirror stores only the three
 * base tables and the balance is the SAME `GROUP BY` the server runs, so both
 * sides answer from the raw items and can never drift into disagreeing.
 */
export class OfflineChargeRepository extends OfflineBaseRepository implements IChargeRepository {
  private async hydrate(charges: DbCharge[]): Promise<DbCharge[]> {
    if (charges.length === 0) return charges;
    const customers = await this.rowsById<DbCustomer>(
      'customers',
      charges.map((c) => c.customer_id).filter((x): x is string => !!x),
    );
    const lines = await this.rowsById<DbCustomerPlan>(
      'customer_plans',
      charges.map((c) => c.customer_plan_id).filter((x): x is string => !!x),
    );
    const plans = await this.rowsById<DbPlan>(
      'plans',
      [...lines.values()].map((l) => l.plan_id).filter((x): x is string => !!x),
    );
    const sales = await this.rowsById<DbSale>(
      'sales',
      charges.map((c) => c.sale_id).filter((x): x is string => !!x),
    );
    return charges.map((c) => {
      const line = c.customer_plan_id ? lines.get(c.customer_plan_id) ?? null : null;
      return {
        ...c,
        customers: c.customer_id ? customers.get(c.customer_id) ?? null : null,
        customer_plans: line
          ? { ...line, plans: line.plan_id ? plans.get(line.plan_id) ?? null : null }
          : null,
        sales: c.sale_id ? sales.get(c.sale_id) ?? null : null,
      };
    });
  }

  async findById(id: string): Promise<DbCharge | null> {
    const row = await this.first<Record<string, unknown>>('SELECT * FROM charges WHERE id = ?', [id]);
    const decoded = this.decodeOne<DbCharge>('charges', row);
    if (!decoded) return null;
    return (await this.hydrate([decoded]))[0];
  }

  async findByIds(ids: string[]): Promise<DbCharge[]> {
    if (ids.length === 0) return [];
    const rows = await this.all(
      `SELECT * FROM charges WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids,
    );
    return this.hydrate(this.decodeAll<DbCharge>('charges', rows));
  }

  async findMonthChargesForLines(customerPlanIds: string[]): Promise<DbChargeWithPaid[]> {
    if (customerPlanIds.length === 0) return [];
    return this.monthChargesWithPaid(
      `c.customer_plan_id IN (${customerPlanIds.map(() => '?').join(',')})`,
      customerPlanIds,
    );
  }

  async findMonthChargesForCustomer(customerId: string): Promise<DbChargeWithPaid[]> {
    return this.monthChargesWithPaid('c.customer_id = ?', [customerId]);
  }

  private async monthChargesWithPaid(
    scope: string,
    params: unknown[],
  ): Promise<DbChargeWithPaid[]> {
    const rows = await this.all<Record<string, unknown>>(
      `SELECT c.*, ${PAID_SUM} AS __paid
         FROM charges c ${PAID_JOIN}
        WHERE c.kind = 'month' AND c.voided_at IS NULL AND ${scope}
        GROUP BY c.id
        ORDER BY c.billing_month ASC`,
      params,
    );
    return this.withPaid(rows);
  }

  async findBySaleIds(saleIds: string[]): Promise<DbCharge[]> {
    if (saleIds.length === 0) return [];
    const ph = saleIds.map(() => '?').join(', ');
    const rows = await this.all(`SELECT * FROM charges WHERE sale_id IN (${ph})`, saleIds);
    return this.hydrate(this.decodeAll<DbCharge>('charges', rows));
  }

  async findBySaleId(saleId: string): Promise<DbCharge | null> {
    const row = await this.first<Record<string, unknown>>(
      'SELECT * FROM charges WHERE sale_id = ?',
      [saleId],
    );
    const decoded = this.decodeOne<DbCharge>('charges', row);
    if (!decoded) return null;
    return (await this.hydrate([decoded]))[0];
  }

  private owedWhere(opts: FindChargesOptions): { sql: string; params: unknown[] } {
    const parts: { clause: string; params: unknown[] }[] = [
      { clause: 'c.voided_at IS NULL AND c.written_off_at IS NULL', params: [] },
    ];
    if (opts.customerId) parts.push({ clause: 'c.customer_id = ?', params: [opts.customerId] });
    if (opts.customerIds?.length) {
      parts.push({
        clause: `c.customer_id IN (${opts.customerIds.map(() => '?').join(',')})`,
        params: opts.customerIds,
      });
    }
    if (opts.kinds?.length) {
      parts.push({
        clause: `c.kind IN (${opts.kinds.map(() => '?').join(',')})`,
        params: opts.kinds,
      });
    }
    parts.push(this.branchWhere(opts.branchFilter ?? null, this.BRANCH_SCOPES.charges, 'c'));
    return this.combineWhere(parts);
  }

  async findOpenWithPaid(opts: FindChargesOptions): Promise<DbChargeWithPaid[]> {
    const where = this.owedWhere(opts);
    const rows = await this.all<Record<string, unknown>>(
      `SELECT * FROM (
         SELECT c.*, ${PAID_SUM} AS __paid
           FROM charges c ${PAID_JOIN}
          ${where.sql}
          GROUP BY c.id
       )
        WHERE CAST(amount AS REAL) - __paid > 0
        ORDER BY due_date ASC`,
      where.params,
    );
    const open = this.withPaid(rows);
    const hydrated = await this.hydrate(open.map((o) => o.charge));
    return hydrated.map((charge, i) => ({ charge, paid: open[i].paid }));
  }

  private withPaid(rows: Record<string, unknown>[]): DbChargeWithPaid[] {
    const paid = rows.map((r) => Number(r.__paid ?? 0));
    return this.decodeAll<DbCharge>('charges', rows).map((charge, i) => ({
      charge,
      paid: paid[i],
    }));
  }

  async balances(chargeIds: string[]): Promise<DbChargeBalance[]> {
    if (chargeIds.length === 0) return [];
    const ph = chargeIds.map(() => '?').join(',');
    const rows = await this.all<{
      id: string;
      tenant_id: string;
      amount: string | number;
      paid: string | number | null;
    }>(
      `SELECT c.id, c.tenant_id, c.amount,
              (SELECT COALESCE(SUM(CAST(i.amount AS REAL)), 0)
                 FROM collection_items i
                 JOIN collections co ON co.id = i.collection_id
                WHERE i.charge_id = c.id AND co.voided_at IS NULL) AS paid
         FROM charges c
        WHERE c.id IN (${ph}) AND c.voided_at IS NULL`,
      chargeIds,
    );
    return rows.map((r) => {
      const amount = Number(r.amount);
      const paid = Number(r.paid ?? 0);
      return { id: r.id, tenant_id: r.tenant_id, amount, paid, balance: amount - paid };
    });
  }

  async create(payload: CreateChargePayload): Promise<DbCharge> {
    const now = nowIso();
    const row: DbCharge = {
      ...payload,
      created_at: now,
      updated_at: now,
      voided_at: null,
      voided_by: null,
      void_reason: null,
      written_off_at: null,
      written_off_by: null,
      write_off_reason: null,
    };
    await this.write(async (db) => {
      await insertDirty(db, 'charges', row);
      await this.auditIn(db, {
        table: 'charges',
        recordId: row.id,
        action: 'create',
        after: row,
        ...(row.customer_id ? await this.customerAudit(row.customer_id) : { branchId: row.branch_id }),
      });
    });
    return row;
  }

  async ensure(payload: CreateChargePayload): Promise<DbCharge> {
    const existing = payload.customer_plan_id
      ? await this.first<Record<string, unknown>>(
          'SELECT * FROM charges WHERE customer_plan_id = ? AND billing_month = ?',
          [payload.customer_plan_id, payload.billing_month],
        )
      : null;
    if (existing) {
      const decoded = this.decodeOne<DbCharge>('charges', existing)!;
      return (await this.hydrate([decoded]))[0];
    }
    return this.create(payload);
  }

  async update(id: string, values: UpdateChargePayload): Promise<DbCharge> {
    return this.patch(id, values, 'update');
  }

  async void(id: string, voidedBy: string, reason: string | null): Promise<DbCharge> {
    return this.patch(
      id,
      { voided_at: nowIso(), voided_by: voidedBy, void_reason: reason },
      'void',
    );
  }

  async writeOff(id: string, writtenOffBy: string, reason: string | null): Promise<DbCharge> {
    return this.patch(
      id,
      {
        written_off_at: nowIso(),
        written_off_by: writtenOffBy,
        write_off_reason: reason,
      },
      'update',
    );
  }

  private async patch(
    id: string,
    values: Record<string, unknown>,
    action: 'void' | 'update',
  ): Promise<DbCharge> {
    const prior = await this.forAudit(id);
    if (!prior) this.handleError(new Error('Charge not found'));
    const changes = { ...values, updated_at: nowIso() };
    const after = { ...prior.row, ...changes } as DbCharge;
    await this.write(async (db) => {
      await updateDirty(db, 'charges', id, changes);
      await this.auditIn(db, {
        table: 'charges',
        recordId: id,
        action,
        before: prior.row,
        after,
        branchId: prior.row.branch_id,
        subject: prior.subject,
      });
    });
    return after;
  }

  private async forAudit(
    id: string,
  ): Promise<{ row: DbCharge; subject: string | null } | null> {
    const raw = await this.first<Record<string, unknown>>(
      `SELECT c.*, cu.name AS __subject FROM charges c
         LEFT JOIN customers cu ON cu.id = c.customer_id
        WHERE c.id = ?`,
      [id],
    );
    const row = this.decodeOne<DbCharge>('charges', raw);
    return row ? { row, subject: (raw?.__subject as string | null) ?? null } : null;
  }

  async writtenOffInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter,
  ): Promise<DbCharge[]> {
    const parts = [
      { clause: 'c.written_off_at IS NOT NULL', params: [] as unknown[] },
      { clause: 'c.written_off_at >= ?', params: [startIso] },
      { clause: 'c.written_off_at < ?', params: [endExclusiveIso] },
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.charges, 'c'),
    ];
    const where = this.combineWhere(parts);
    const rows = await this.all(
      `SELECT c.* FROM charges c ${where.sql}`,
      where.params,
    );
    return this.hydrate(this.decodeAll<DbCharge>('charges', rows));
  }
}
