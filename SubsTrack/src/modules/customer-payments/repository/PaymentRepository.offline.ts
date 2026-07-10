import { OFFLINE_PAGE_SIZE, type BranchFilter } from '@/src/core/constants';
import type { DbCustomer, DbPayment, DbPlan } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { upsertPaymentDirty } from '@/src/core/offline/db/dml';
import { deterministicId, nowIso } from '@/src/core/offline/ids';
import type { FindPaymentsOptions } from '../utils/types';
import type {
  AmountRow,
  CreatePaymentPayload,
  IPaymentRepository,
  MonthlyAmountRow,
  UpdatePaymentPayload,
} from './IPaymentRepository';

function dayStartIso(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
}
function nextDayStartIso(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d + 1).toISOString();
}

/**
 * SQLite-backed payments repository. Writes upsert on the natural key
 * (customer_plan_id, billing_month) with a DETERMINISTIC id derived from that
 * key, so two devices recording the same month converge on push instead of
 * colliding. Money columns are stored as exact-decimal TEXT and compared with
 * CAST(... AS REAL) so `> 0` / `= 0` behave numerically.
 */
export class OfflinePaymentRepository extends OfflineBaseRepository implements IPaymentRepository {
  private buildRow(payload: CreatePaymentPayload, id: string, now: string): DbPayment {
    return {
      ...payload,
      id,
      balance: payload.amount_due - payload.amount_paid,
      paid_at: now,
      voided_at: null,
      voided_by: null,
      created_at: now,
      updated_at: now,
    };
  }

  async findAll(opts: FindPaymentsOptions = {}): Promise<DbPayment[]> {
    const page = opts.page ?? 0;
    const parts: { clause: string; params: unknown[] }[] = [
      { clause: 'CAST(p.amount_paid AS REAL) > 0', params: [] },
    ];
    if (!opts.includeVoided) parts.push({ clause: 'p.voided_at IS NULL', params: [] });
    if (opts.customerId) parts.push({ clause: 'p.customer_id = ?', params: [opts.customerId] });
    if (opts.receivedByUserId)
      parts.push({ clause: 'p.received_by_user_id = ?', params: [opts.receivedByUserId] });
    if (opts.billingMonth) parts.push({ clause: 'p.billing_month = ?', params: [opts.billingMonth] });
    if (opts.paidFrom) parts.push({ clause: 'p.paid_at >= ?', params: [dayStartIso(opts.paidFrom)] });
    if (opts.paidTo) parts.push({ clause: 'p.paid_at < ?', params: [nextDayStartIso(opts.paidTo)] });
    if (opts.status === 'paid') parts.push({ clause: 'CAST(p.balance AS REAL) = 0', params: [] });
    else if (opts.status === 'partial') parts.push({ clause: 'CAST(p.balance AS REAL) > 0', params: [] });
    parts.push(this.branchWhere(opts.branchFilter ?? null, this.BRANCH_SCOPES.payments, 'c'));

    const { sql, params } = this.combineWhere(parts);
    const rows = await this.all(
      `SELECT p.* FROM payments p JOIN customers c ON p.customer_id = c.id
       ${sql} ORDER BY p.paid_at DESC LIMIT ${OFFLINE_PAGE_SIZE} OFFSET ${page * OFFLINE_PAGE_SIZE}`,
      params,
    );
    return this.hydrateListJoins(this.decodeAll<DbPayment>('payments', rows));
  }

  // Attach the joined `customers` (name, branch_id) and `plans` (name) shapes.
  private async hydrateListJoins(payments: DbPayment[]): Promise<DbPayment[]> {
    if (payments.length === 0) return payments;
    const customers = await this.rowsById<DbCustomer>('customers', payments.map((p) => p.customer_id));
    const plans = await this.rowsById<DbPlan>(
      'plans',
      payments.map((p) => p.plan_id).filter((p): p is string => !!p),
    );
    return payments.map((p) => ({
      ...p,
      customers: customers.get(p.customer_id) ?? null,
      plans: p.plan_id ? plans.get(p.plan_id) ?? null : null,
    }));
  }

  async findByCustomer(customerId: string): Promise<DbPayment[]> {
    const rows = await this.all(
      'SELECT * FROM payments WHERE customer_id = ? AND voided_at IS NULL ORDER BY billing_month',
      [customerId],
    );
    return this.decodeAll<DbPayment>('payments', rows);
  }

  async create(payload: CreatePaymentPayload): Promise<DbPayment> {
    const id = await deterministicId(payload.customer_plan_id, payload.billing_month);
    const row = this.buildRow(payload, id, nowIso());
    await this.write((db) => upsertPaymentDirty(db, row));
    return row;
  }

  async createMany(payloads: CreatePaymentPayload[]): Promise<DbPayment[]> {
    if (payloads.length === 0) return [];
    const now = nowIso();
    const rows: DbPayment[] = [];
    for (const p of payloads) {
      rows.push(this.buildRow(p, await deterministicId(p.customer_plan_id, p.billing_month), now));
    }
    await this.write(async (db) => {
      for (const row of rows) await upsertPaymentDirty(db, row);
    });
    return rows;
  }

  async updatePayment(id: string, payload: UpdatePaymentPayload): Promise<DbPayment> {
    const now = nowIso();
    const balance = payload.amountDue - payload.amountPaid;
    await this.write((db) =>
      db.runAsync(
        `UPDATE payments SET amount_due = ?, amount_paid = ?, currency_id = ?,
           rate_per_usd_snapshot = ?, balance = ?, updated_at = ?, _dirty = 1
         WHERE id = ? AND voided_at IS NULL`,
        [
          String(payload.amountDue),
          String(payload.amountPaid),
          payload.currencyId,
          String(payload.ratePerUsdSnapshot),
          String(balance),
          now,
          id,
        ] as never[],
      ),
    );
    const row = await this.first('SELECT * FROM payments WHERE id = ?', [id]);
    if (!row) this.handleError(new Error('Payment not found'));
    return this.decodeOne<DbPayment>('payments', row)!;
  }

  async voidPayment(id: string, voidedBy: string, notes: string | null): Promise<DbPayment> {
    const [row] = await this.voidMany([id], voidedBy, notes);
    return row;
  }

  async voidMany(ids: string[], voidedBy: string, notes: string | null): Promise<DbPayment[]> {
    if (ids.length === 0) return [];
    const now = nowIso();
    await this.write(async (db) => {
      for (const id of ids) {
        await db.runAsync(
          `UPDATE payments SET voided_at = ?, voided_by = ?, notes = ?, updated_at = ?, _dirty = 1 WHERE id = ?`,
          [now, voidedBy, notes, now, id] as never[],
        );
      }
    });
    const ph = ids.map(() => '?').join(', ');
    const rows = await this.all(`SELECT * FROM payments WHERE id IN (${ph})`, ids);
    return this.decodeAll<DbPayment>('payments', rows);
  }

  // Reuses the ONLINE JS aggregation verbatim; only the two fetches are local SQL.
  async findPaymentStatusForMonth(
    billingMonth: string,
  ): Promise<{ fullyPaidIds: Set<string>; partialIds: Set<string> }> {
    const [year, monthStr] = billingMonth.split('-').map(Number);
    const cutoffDate = new Date(year, monthStr - 1 - 12, 1);
    const cutoff = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-01`;
    const target = new Date(billingMonth);

    const lineRows = await this.all<{ id: string; customer_id: string; start_date: string }>(
      'SELECT id, customer_id, start_date FROM customer_plans WHERE active = 1',
    );
    const linesByCustomer = new Map<string, string[]>();
    for (const l of lineRows) {
      const [sy, sm] = l.start_date.split('-').map(Number);
      if (new Date(`${sy}-${String(sm).padStart(2, '0')}-01`) > target) continue;
      const list = linesByCustomer.get(l.customer_id);
      if (list) list.push(l.id);
      else linesByCustomer.set(l.customer_id, [l.id]);
    }

    const data = await this.all<{
      customer_plan_id: string;
      billing_month: string;
      duration_months: number;
      balance: string | number;
    }>(
      `SELECT customer_plan_id, billing_month, duration_months, balance FROM payments
       WHERE billing_month <= ? AND billing_month >= ? AND voided_at IS NULL
         AND CAST(amount_paid AS REAL) > 0`,
      [billingMonth, cutoff],
    );

    const settledByLine = new Map<string, boolean>();
    for (const r of data) {
      const start = new Date(r.billing_month);
      const end = new Date(start);
      end.setMonth(end.getMonth() + r.duration_months - 1);
      if (end < target) continue;
      settledByLine.set(r.customer_plan_id, Number(r.balance) === 0);
    }

    const fullyPaidIds = new Set<string>();
    const partialIds = new Set<string>();
    for (const [customerId, lineIds] of linesByCustomer) {
      let anyCovered = false;
      let allCoveredAndSettled = true;
      for (const lineId of lineIds) {
        if (settledByLine.has(lineId)) {
          anyCovered = true;
          if (!settledByLine.get(lineId)) allCoveredAndSettled = false;
        } else {
          allCoveredAndSettled = false;
        }
      }
      if (!anyCovered) continue;
      if (allCoveredAndSettled) fullyPaidIds.add(customerId);
      else partialIds.add(customerId);
    }
    return { fullyPaidIds, partialIds };
  }

  async findActivePayments(): Promise<DbPayment[]> {
    const rows = await this.all(
      'SELECT * FROM payments WHERE voided_at IS NULL AND CAST(amount_paid AS REAL) > 0',
    );
    return this.decodeAll<DbPayment>('payments', rows);
  }

  async paidAmountsForMonth(
    monthStartIso: string,
    monthEndExclusiveIso: string,
    branchFilter: BranchFilter = null,
  ): Promise<AmountRow[]> {
    const branch = this.branchWhere(branchFilter, this.BRANCH_SCOPES.payments, 'c');
    const rows = await this.all<{ amount_paid: string; rate_per_usd_snapshot: string }>(
      `SELECT p.amount_paid, p.rate_per_usd_snapshot
       FROM payments p JOIN customers c ON p.customer_id = c.id
       WHERE p.paid_at >= ? AND p.paid_at < ? AND p.voided_at IS NULL
         ${branch.clause ? `AND ${branch.clause}` : ''}`,
      [monthStartIso, monthEndExclusiveIso, ...branch.params],
    );
    return rows.map((r) => ({
      amount: Number(r.amount_paid),
      ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
    }));
  }

  async paidAmountsInRange(
    rangeStartIso: string,
    rangeEndExclusiveIso: string,
    branchFilter: BranchFilter = null,
  ): Promise<MonthlyAmountRow[]> {
    const branch = this.branchWhere(branchFilter, this.BRANCH_SCOPES.payments, 'c');
    const rows = await this.all<{ paid_at: string; amount_paid: string; rate_per_usd_snapshot: string }>(
      `SELECT p.paid_at, p.amount_paid, p.rate_per_usd_snapshot
       FROM payments p JOIN customers c ON p.customer_id = c.id
       WHERE p.paid_at >= ? AND p.paid_at < ? AND p.voided_at IS NULL
         ${branch.clause ? `AND ${branch.clause}` : ''}`,
      [rangeStartIso, rangeEndExclusiveIso, ...branch.params],
    );
    return rows.map((r) => ({
      paidAt: r.paid_at,
      amount: Number(r.amount_paid),
      ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
    }));
  }

  async partialPayments(branchFilter: BranchFilter = null): Promise<DbPayment[]> {
    const branch = this.branchWhere(branchFilter, this.BRANCH_SCOPES.payments, 'c');
    const rows = await this.all(
      `SELECT p.* FROM payments p JOIN customers c ON p.customer_id = c.id
       WHERE p.voided_at IS NULL AND CAST(p.amount_paid AS REAL) > 0 AND CAST(p.balance AS REAL) > 0
         ${branch.clause ? `AND ${branch.clause}` : ''}
       ORDER BY p.billing_month DESC`,
      [...branch.params],
    );
    return this.hydrateListJoins(this.decodeAll<DbPayment>('payments', rows));
  }
}
