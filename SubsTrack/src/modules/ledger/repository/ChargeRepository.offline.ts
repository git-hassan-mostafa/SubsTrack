import type { BranchFilter } from '@/src/core/constants';
import type { DbCharge, DbChargeBalance, DbCustomer, DbCustomerPlan, DbPlan, DbSale } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { insertDirty, updateDirty } from '@/src/core/offline/db/dml';
import { nowIso } from '@/src/core/offline/ids';
import type {
  CreateChargePayload,
  FindChargesOptions,
  IChargeRepository,
  UpdateChargePayload,
} from './IChargeRepository';

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

  async findMonthChargesForLines(customerPlanIds: string[]): Promise<DbCharge[]> {
    if (customerPlanIds.length === 0) return [];
    const rows = await this.all(
      `SELECT * FROM charges
        WHERE kind = 'month' AND voided_at IS NULL
          AND customer_plan_id IN (${customerPlanIds.map(() => '?').join(',')})
        ORDER BY billing_month ASC`,
      customerPlanIds,
    );
    return this.decodeAll<DbCharge>('charges', rows);
  }

  async findMonthChargesForCustomer(customerId: string): Promise<DbCharge[]> {
    const rows = await this.all(
      `SELECT * FROM charges
        WHERE kind = 'month' AND voided_at IS NULL AND customer_id = ?
        ORDER BY billing_month ASC`,
      [customerId],
    );
    return this.decodeAll<DbCharge>('charges', rows);
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

  async find(opts: FindChargesOptions): Promise<DbCharge[]> {
    const parts: { clause: string; params: unknown[] }[] = [
      { clause: 'c.voided_at IS NULL', params: [] },
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
    const where = this.combineWhere(parts);
    const rows = await this.all(
      `SELECT c.* FROM charges c
         LEFT JOIN customers cu ON cu.id = c.customer_id
        ${where.sql}
        ORDER BY c.due_date ASC`,
      where.params,
    );
    const charges = this.decodeAll<DbCharge>('charges', rows);
    const hydrated = await this.hydrate(charges);
    if (!opts.openOnly) return hydrated;
    const open = new Set(
      (await this.balances(hydrated.map((c) => c.id))).filter((b) => b.balance > 0).map((b) => b.id),
    );
    return hydrated.filter((c) => open.has(c.id));
  }

  /**
   * The local `charge_balances`. Same rule as `product_stock`: sum the ledger,
   * never a counter — a voided collection simply stops contributing, so a
   * balance corrects itself with nothing to recompute.
   */
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
        WHERE c.id IN (${ph})
          AND c.voided_at IS NULL AND c.written_off_at IS NULL`,
      chargeIds,
    );
    return rows.map((r) => {
      const amount = Number(r.amount);
      const paid = Number(r.paid ?? 0);
      return { id: r.id, tenant_id: r.tenant_id, amount, paid, balance: amount - paid };
    });
  }

  async openBalances(opts: FindChargesOptions): Promise<DbChargeBalance[]> {
    const charges = await this.find({ ...opts, openOnly: false });
    const balances = await this.balances(charges.map((c) => c.id));
    return balances.filter((b) => b.balance > 0);
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
    return (await this.findById(row.id)) ?? row;
  }

  /**
   * Find-or-create on the natural key. An existing bill is returned UNTOUCHED —
   * it keeps its frozen price, its id and its due date, because re-collecting a
   * month must never re-price what the customer was originally billed.
   *
   * Deliberately NOT `upsertNaturalKeyDirty`: that writer patches every non-key
   * column onto the existing row, which is right for a skip toggle and wrong
   * here — it would overwrite a January bill of $20 with today's $25.
   */
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
    const prior = await this.findById(id);
    await this.write(async (db) => {
      await updateDirty(db, 'charges', id, { ...values, updated_at: nowIso() });
      const after = await this.first<Record<string, unknown>>(
        'SELECT * FROM charges WHERE id = ?',
        [id],
      );
      await this.auditIn(db, {
        table: 'charges',
        recordId: id,
        action: 'update',
        before: prior,
        after: this.decodeOne<DbCharge>('charges', after),
        branchId: prior?.branch_id ?? null,
        subject: prior?.customers?.name ?? null,
      });
    });
    return (await this.findById(id))!;
  }

  async void(id: string, voidedBy: string, reason: string | null): Promise<DbCharge> {
    return this.softMark(id, 'void', {
      voided_at: nowIso(),
      voided_by: voidedBy,
      void_reason: reason,
    });
  }

  async writeOff(id: string, writtenOffBy: string, reason: string | null): Promise<DbCharge> {
    // 'update', not 'void': the bill was real. The trail must be able to tell a
    // mistake apart from money the business gave up on.
    return this.softMark(id, 'update', {
      written_off_at: nowIso(),
      written_off_by: writtenOffBy,
      write_off_reason: reason,
    });
  }

  private async softMark(
    id: string,
    action: 'void' | 'update',
    values: Record<string, unknown>,
  ): Promise<DbCharge> {
    const prior = await this.findById(id);
    await this.write(async (db) => {
      await updateDirty(db, 'charges', id, { ...values, updated_at: nowIso() });
      const after = await this.first<Record<string, unknown>>(
        'SELECT * FROM charges WHERE id = ?',
        [id],
      );
      await this.auditIn(db, {
        table: 'charges',
        recordId: id,
        action,
        before: prior,
        after: this.decodeOne<DbCharge>('charges', after),
        branchId: prior?.branch_id ?? null,
        subject: prior?.customers?.name ?? null,
      });
    });
    return (await this.findById(id))!;
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
      `SELECT c.* FROM charges c
         LEFT JOIN customers cu ON cu.id = c.customer_id
        ${where.sql}`,
      where.params,
    );
    return this.hydrate(this.decodeAll<DbCharge>('charges', rows));
  }
}
