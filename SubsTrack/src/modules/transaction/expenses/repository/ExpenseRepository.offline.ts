import { type BranchFilter } from '@/src/core/constants';
import type { DbExpense } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { insertDirty } from '@/src/core/offline/db/dml';
import { newId, nowIso } from '@/src/core/offline/ids';
import type {
  CreateExpensePayload,
  ExpenseAmountRow,
  IExpenseRepository,
} from './IExpenseRepository';

/**
 * SQLite-backed expenses repository. `expenses` owns its branch_id, so reads
 * scope on the table's own column (no join). Writes use a client-generated id
 * (no natural key) and flag the row `_dirty` for the next sync.
 *
 * The server RLS is admin-only, so a collector's mirror simply pulls nothing —
 * there is no extra client-side gate here.
 */
export class OfflineExpenseRepository
  extends OfflineBaseRepository
  implements IExpenseRepository
{
  async findInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter = null,
  ): Promise<DbExpense[]> {
    const where = this.combineWhere([
      { clause: 'e.voided_at IS NULL', params: [] },
      { clause: 'e.incurred_at >= ? AND e.incurred_at < ?', params: [startIso, endExclusiveIso] },
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.expenses, 'e'),
    ]);
    const rows = await this.all(
      `SELECT e.* FROM expenses e ${where.sql} ORDER BY e.incurred_at DESC`,
      where.params,
    );
    return this.decodeAll<DbExpense>('expenses', rows);
  }

  // Not audited: append-only + voidable, so the Expenses list is already its own
  // history — the same call as the debt tables.
  async create(payload: CreateExpensePayload): Promise<DbExpense> {
    const now = nowIso();
    const row: DbExpense = {
      ...payload,
      id: newId(),
      created_at: now,
      updated_at: now,
      voided_at: null,
      voided_by: null,
      void_reason: null,
    };
    await this.write(async (db) => {
      await insertDirty(db, 'expenses', row);
    });
    return row;
  }

  async void(id: string, voidedBy: string, reason: string | null): Promise<DbExpense> {
    const now = nowIso();
    await this.write(async (db) => {
      // A raw UPDATE must set _dirty by hand — only the dml.ts helpers do it.
      await db.runAsync(
        `UPDATE expenses SET voided_at = ?, voided_by = ?, void_reason = ?, updated_at = ?, _dirty = 1
         WHERE id = ? AND voided_at IS NULL`,
        [now, voidedBy, reason, now, id] as never[],
      );
    });
    const row = await this.first('SELECT * FROM expenses WHERE id = ?', [id]);
    if (!row) this.handleError(new Error('Expense not found'));
    return this.decodeOne<DbExpense>('expenses', row)!;
  }

  async totalsInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter = null,
  ): Promise<ExpenseAmountRow[]> {
    const where = this.combineWhere([
      { clause: 'e.voided_at IS NULL', params: [] },
      { clause: 'e.incurred_at >= ? AND e.incurred_at < ?', params: [startIso, endExclusiveIso] },
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.expenses, 'e'),
    ]);
    const rows = await this.all<{
      incurred_at: string;
      amount: string;
      rate_per_usd_snapshot: string;
    }>(
      `SELECT e.incurred_at, e.amount, e.rate_per_usd_snapshot FROM expenses e ${where.sql}`,
      where.params,
    );
    return rows.map((r) => ({
      incurredAt: r.incurred_at,
      amount: Number(r.amount),
      ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
    }));
  }
}
