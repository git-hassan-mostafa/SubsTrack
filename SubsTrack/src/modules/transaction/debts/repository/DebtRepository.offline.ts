import { type BranchFilter } from '@/src/core/constants';
import type { DbCustomDebt, DbCustomer, DbDebtPayment } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { insertDirty } from '@/src/core/offline/db/dml';
import { newId, nowIso } from '@/src/core/offline/ids';
import { custodyValues } from '@/src/modules/wallet/utils/custodyValues';
import type {
  CreateCustomDebtPayload,
  CreateDebtPaymentPayload,
  IDebtRepository,
} from './IDebtRepository';

/**
 * SQLite-backed debts repository (custom_debts + debt_payments). Both tables
 * inherit their branch from the customer, so reads JOIN customers and scope on
 * `c.branch_id`. Writes use a client-generated id (no natural key) and flag the
 * row `_dirty` for the next sync. Reads reproduce the Supabase
 * `customers!inner(name, branch_id)` join by hydrating the customer row.
 */
export class OfflineDebtRepository extends OfflineBaseRepository implements IDebtRepository {
  private async attachCustomers<T extends { customer_id: string; customers?: DbCustomer | null }>(
    rows: T[],
  ): Promise<T[]> {
    if (rows.length === 0) return rows;
    const customers = await this.rowsById<DbCustomer>('customers', rows.map((r) => r.customer_id));
    return rows.map((r) => ({ ...r, customers: customers.get(r.customer_id) ?? null }));
  }

  async customDebts(branchFilter: BranchFilter = null): Promise<DbCustomDebt[]> {
    const branch = this.branchWhere(branchFilter, this.BRANCH_SCOPES.custom_debts, 'c');
    const rows = await this.all(
      `SELECT d.* FROM custom_debts d JOIN customers c ON d.customer_id = c.id
       WHERE d.voided_at IS NULL ${branch.clause ? `AND ${branch.clause}` : ''}
       ORDER BY d.incurred_at DESC`,
      [...branch.params],
    );
    return this.attachCustomers(this.decodeAll<DbCustomDebt>('custom_debts', rows));
  }

  async debtPayments(branchFilter: BranchFilter = null): Promise<DbDebtPayment[]> {
    const branch = this.branchWhere(branchFilter, this.BRANCH_SCOPES.debt_payments, 'c');
    const rows = await this.all(
      `SELECT d.* FROM debt_payments d JOIN customers c ON d.customer_id = c.id
       WHERE d.voided_at IS NULL ${branch.clause ? `AND ${branch.clause}` : ''}
       ORDER BY d.paid_at DESC`,
      [...branch.params],
    );
    return this.attachCustomers(this.decodeAll<DbDebtPayment>('debt_payments', rows));
  }

  // Not audited: both debt tables are append-only + voidable, so the Debts view is
  // already their history. See docs/features.md → Audit Trail.
  async createCustomDebt(payload: CreateCustomDebtPayload): Promise<DbCustomDebt> {
    const now = nowIso();
    const row: DbCustomDebt = {
      ...payload,
      id: newId(),
      created_at: now,
      updated_at: now,
      voided_at: null,
      voided_by: null,
      void_reason: null,
    };
    await this.write(async (db) => {
      await insertDirty(db, 'custom_debts', row);
    });
    const [hydrated] = await this.attachCustomers([row]);
    return hydrated;
  }

  async voidCustomDebt(id: string, voidedBy: string, reason: string | null): Promise<DbCustomDebt> {
    const now = nowIso();
    await this.write(async (db) => {
      await db.runAsync(
        `UPDATE custom_debts SET voided_at = ?, voided_by = ?, void_reason = ?, updated_at = ?, _dirty = 1
         WHERE id = ? AND voided_at IS NULL`,
        [now, voidedBy, reason, now, id] as never[],
      );
    });
    const row = await this.first('SELECT * FROM custom_debts WHERE id = ?', [id]);
    if (!row) this.handleError(new Error('Custom debt not found'));
    const [hydrated] = await this.attachCustomers([this.decodeOne<DbCustomDebt>('custom_debts', row)!]);
    return hydrated;
  }

  async createDebtPayment(payload: CreateDebtPaymentPayload): Promise<DbDebtPayment> {
    const now = nowIso();
    const row: DbDebtPayment = {
      ...payload,
      id: newId(),
      created_at: now,
      updated_at: now,
      voided_at: null,
      voided_by: null,
      void_reason: null,
      // The cash starts in the receiving user's wallet.
      held_by_user_id: payload.received_by_user_id,
      remitted_at: null,
      remitted_by: null,
    };
    await this.write(async (db) => {
      await insertDirty(db, 'debt_payments', row);
    });
    const [hydrated] = await this.attachCustomers([row]);
    return hydrated;
  }

  async voidDebtPayment(id: string, voidedBy: string, reason: string | null): Promise<DbDebtPayment> {
    const now = nowIso();
    await this.write(async (db) => {
      await db.runAsync(
        `UPDATE debt_payments SET voided_at = ?, voided_by = ?, void_reason = ?, updated_at = ?, _dirty = 1
         WHERE id = ? AND voided_at IS NULL`,
        [now, voidedBy, reason, now, id] as never[],
      );
    });
    const row = await this.first('SELECT * FROM debt_payments WHERE id = ?', [id]);
    if (!row) this.handleError(new Error('Debt payment not found'));
    const [hydrated] = await this.attachCustomers([this.decodeOne<DbDebtPayment>('debt_payments', row)!]);
    return hydrated;
  }

  async paidAmountsInRange(
    rangeStartIso: string,
    rangeEndExclusiveIso: string,
    branchFilter: BranchFilter = null,
  ): Promise<{ paidAt: string; amount: number; ratePerUsdSnapshot: number }[]> {
    const branch = this.branchWhere(branchFilter, this.BRANCH_SCOPES.debt_payments, 'c');
    const rows = await this.all<{ paid_at: string; amount: string; rate_per_usd_snapshot: string }>(
      `SELECT d.paid_at, d.amount, d.rate_per_usd_snapshot FROM debt_payments d
       JOIN customers c ON d.customer_id = c.id
       WHERE d.paid_at >= ? AND d.paid_at < ? AND d.voided_at IS NULL
         ${branch.clause ? `AND ${branch.clause}` : ''}`,
      [rangeStartIso, rangeEndExclusiveIso, ...branch.params],
    );
    return rows.map((r) => ({
      paidAt: r.paid_at,
      amount: Number(r.amount),
      ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
    }));
  }

  async heldDebtPayments(
    branchFilter: BranchFilter = null,
    holderUserId: string | null = null,
  ): Promise<DbDebtPayment[]> {
    const parts: { clause: string; params: unknown[] }[] = [
      { clause: 'd.voided_at IS NULL', params: [] },
      { clause: 'd.held_by_user_id IS NOT NULL', params: [] },
    ];
    if (holderUserId) parts.push({ clause: 'd.held_by_user_id = ?', params: [holderUserId] });
    parts.push(this.branchWhere(branchFilter, this.BRANCH_SCOPES.debt_payments, 'c'));
    const { sql, params } = this.combineWhere(parts);
    const rows = await this.all(
      `SELECT d.* FROM debt_payments d JOIN customers c ON d.customer_id = c.id
       ${sql} ORDER BY d.paid_at DESC`,
      params,
    );
    return this.attachCustomers(this.decodeAll<DbDebtPayment>('debt_payments', rows));
  }

  async transferDebtPaymentCustody(
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
      await db.runAsync(
        `UPDATE debt_payments
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
    });
  }
}
