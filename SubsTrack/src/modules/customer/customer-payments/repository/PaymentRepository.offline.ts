import { OFFLINE_PAGE_SIZE, type BranchFilter } from '@/src/core/constants';
import type { DbCustomer, DbPayment, DbPlan } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { upsertNaturalKeyDirty } from '@/src/core/offline/db/dml';
import { deterministicId, nowIso } from '@/src/core/offline/ids';
import { custodyValues } from '@/src/modules/wallet/utils/custodyValues';
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
      // Re-recording a voided month is fresh cash back in its collector's wallet.
      // Written explicitly so the ON CONFLICT upsert resets any custody the
      // reused row had picked up.
      held_by_user_id: payload.received_by_user_id,
      remitted_at: null,
      remitted_by: null,
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

  // Attach the joined `customers` (whole row — name, phone_number, branch_id) and
  // `plans` (name) shapes.
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

  // Voided rows included on purpose — see the Supabase sibling.
  async findByIds(ids: string[]): Promise<DbPayment[]> {
    if (ids.length === 0) return [];
    const ph = ids.map(() => '?').join(', ');
    const rows = await this.all(`SELECT * FROM payments WHERE id IN (${ph})`, ids);
    return this.decodeAll<DbPayment>('payments', rows);
  }

  async create(payload: CreatePaymentPayload): Promise<DbPayment> {
    const id = await deterministicId(payload.customer_plan_id, payload.billing_month);
    const row = this.buildRow(payload, id, nowIso());
    // Read before write() — the audit facts come from a read, and the transaction
    // must stay as short as possible.
    const owner = await this.customerAudit(payload.customer_id);
    // The mirror may already hold this line+month under another id (created on the
    // web / another device) — echo back the id it actually stored, never the
    // intended one, or the caller's Payment would point at a row that isn't there.
    const storedId = await this.write(async (db) => {
      const stored = await upsertNaturalKeyDirty(db, 'payments', row);
      await this.auditIn(db, {
        table: 'payments',
        recordId: stored,
        action: 'create',
        after: { ...row, id: stored },
        ...owner,
      });
      return stored;
    });
    return { ...row, id: storedId };
  }

  async createMany(payloads: CreatePaymentPayload[]): Promise<DbPayment[]> {
    if (payloads.length === 0) return [];
    const now = nowIso();
    const rows: DbPayment[] = [];
    for (const p of payloads) {
      rows.push(this.buildRow(p, await deterministicId(p.customer_plan_id, p.billing_month), now));
    }
    // One lookup per distinct customer, resolved before the transaction opens.
    const owners = new Map<string, { branchId: string | null; subject: string | null }>();
    for (const p of payloads) {
      if (!owners.has(p.customer_id)) owners.set(p.customer_id, await this.customerAudit(p.customer_id));
    }
    const storedIds = await this.write(async (db) => {
      const ids: string[] = [];
      for (const row of rows) {
        const stored = await upsertNaturalKeyDirty(db, 'payments', row);
        ids.push(stored);
        await this.auditIn(db, {
          table: 'payments',
          recordId: stored,
          action: 'create',
          after: { ...row, id: stored },
          ...owners.get(row.customer_id),
        });
      }
      return ids;
    });
    return rows.map((row, i) => ({ ...row, id: storedIds[i] }));
  }

  async updatePayment(id: string, payload: UpdatePaymentPayload): Promise<DbPayment> {
    const now = nowIso();
    const balance = payload.amountDue - payload.amountPaid;
    const updated = await this.write(async (db) => {
      const before = this.decodeOne<DbPayment>(
        'payments',
        await this.first('SELECT * FROM payments WHERE id = ?', [id]),
      );
      await db.runAsync(
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
      );
      const after = this.decodeOne<DbPayment>(
        'payments',
        await this.first('SELECT * FROM payments WHERE id = ?', [id]),
      );
      if (before && after) {
        await this.auditIn(db, {
          table: 'payments',
          recordId: id,
          action: 'update',
          before,
          after,
          ...(await this.customerAudit(after.customer_id)),
        });
      }
      return after;
    });
    if (!updated) this.handleError(new Error('Payment not found'));
    return updated;
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
        const before = this.decodeOne<DbPayment>(
          'payments',
          await this.first('SELECT * FROM payments WHERE id = ?', [id]),
        );
        await db.runAsync(
          `UPDATE payments SET voided_at = ?, voided_by = ?, notes = ?, updated_at = ?, _dirty = 1 WHERE id = ?`,
          [now, voidedBy, notes, now, id] as never[],
        );
        const after = this.decodeOne<DbPayment>(
          'payments',
          await this.first('SELECT * FROM payments WHERE id = ?', [id]),
        );
        if (before && after) {
          await this.auditIn(db, {
            table: 'payments',
            recordId: id,
            action: 'void',
            before,
            after,
            ...(await this.customerAudit(after.customer_id)),
          });
        }
      }
    });
    const ph = ids.map(() => '?').join(', ');
    const rows = await this.all(`SELECT * FROM payments WHERE id IN (${ph})`, ids);
    return this.decodeAll<DbPayment>('payments', rows);
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

  // Same filters as findAll but unpaginated + a lean projection — used to
  // compute the true per-month total when a month holds more rows than one
  // findAll page.
  async monthlyTotals(opts: FindPaymentsOptions = {}): Promise<MonthlyAmountRow[]> {
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
    const rows = await this.all<{ paid_at: string; amount_paid: string; rate_per_usd_snapshot: string }>(
      `SELECT p.paid_at, p.amount_paid, p.rate_per_usd_snapshot
       FROM payments p JOIN customers c ON p.customer_id = c.id
       ${sql}`,
      params,
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

  async heldForWallet(
    branchFilter: BranchFilter = null,
    holderUserId: string | null = null,
  ): Promise<DbPayment[]> {
    const parts: { clause: string; params: unknown[] }[] = [
      { clause: 'CAST(p.amount_paid AS REAL) > 0', params: [] },
      { clause: 'p.voided_at IS NULL', params: [] },
      { clause: 'p.held_by_user_id IS NOT NULL', params: [] },
    ];
    if (holderUserId) parts.push({ clause: 'p.held_by_user_id = ?', params: [holderUserId] });
    parts.push(this.branchWhere(branchFilter, this.BRANCH_SCOPES.payments, 'c'));
    const { sql, params } = this.combineWhere(parts);
    const rows = await this.all(
      `SELECT p.* FROM payments p JOIN customers c ON p.customer_id = c.id
       ${sql} ORDER BY p.paid_at DESC`,
      params,
    );
    return this.hydrateListJoins(this.decodeAll<DbPayment>('payments', rows));
  }

  async transferCustody(
    ids: string[],
    fromUserId: string,
    toUserId: string | null,
    actorUserId: string,
  ): Promise<void> {
    if (ids.length === 0) return;
    const now = nowIso();
    const values = custodyValues(toUserId, actorUserId, now);
    const ph = ids.map(() => '?').join(', ');
    await this.write(async (db) => {
      // Snapshot first: the UPDATE is conditional, so only the rows it actually
      // moved (still held by `fromUserId`, not voided) belong in the trail.
      const before = this.decodeAll<DbPayment>(
        'payments',
        await this.all(
          `SELECT * FROM payments
            WHERE id IN (${ph}) AND held_by_user_id = ? AND voided_at IS NULL`,
          [...ids, fromUserId],
        ),
      );
      await db.runAsync(
        `UPDATE payments
            SET held_by_user_id = ?, remitted_at = ?, remitted_by = ?, updated_at = ?, _dirty = 1
          WHERE id IN (${ph}) AND held_by_user_id = ? AND voided_at IS NULL`,
        [
          values.held_by_user_id,
          values.remitted_at,
          values.remitted_by,
          now,
          ...ids,
          fromUserId,
        ] as never[],
      );
      for (const row of before) {
        await this.auditIn(db, {
          table: 'payments',
          recordId: row.id,
          action: 'update',
          before: row,
          after: { ...row, ...values },
          ...(await this.customerAudit(row.customer_id)),
        });
      }
    });
  }
}
