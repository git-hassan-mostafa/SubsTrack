import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import { type BranchFilter } from '@/src/core/constants';
import type { DbExpense } from '@/src/core/types/db';
import type {
  CreateExpensePayload,
  ExpenseAmountRow,
  IExpenseRepository,
} from './IExpenseRepository';
import { OfflineExpenseRepository } from './ExpenseRepository.offline';

export class ExpenseRepository extends BaseRepository implements IExpenseRepository {
  async findInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter = null,
  ): Promise<DbExpense[]> {
    let query = this.db
      .from('expenses')
      .select('*')
      .is('voided_at', null)
      .gte('incurred_at', startIso)
      .lt('incurred_at', endExclusiveIso)
      .order('incurred_at', { ascending: false });
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.expenses);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []) as DbExpense[];
  }

  // Not audited: append-only + voidable, so the Expenses list is already its own
  // history — the same call as the debt tables. See docs/features.md → Audit Trail.
  async create(payload: CreateExpensePayload): Promise<DbExpense> {
    const { data, error } = await this.db
      .from('expenses')
      .insert({ ...payload, voided_at: null, voided_by: null, void_reason: null })
      .select('*')
      .single();
    if (error) this.handleError(error);
    return data as DbExpense;
  }

  async void(id: string, voidedBy: string, reason: string | null): Promise<DbExpense> {
    const { data, error } = await this.db
      .from('expenses')
      .update({ voided_at: new Date().toISOString(), voided_by: voidedBy, void_reason: reason })
      .eq('id', id)
      .is('voided_at', null)
      .select('*')
      .single();
    if (error) this.handleError(error);
    return data as DbExpense;
  }

  async totalsInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter = null,
  ): Promise<ExpenseAmountRow[]> {
    let query = this.db
      .from('expenses')
      .select('incurred_at, amount, rate_per_usd_snapshot')
      .is('voided_at', null)
      .gte('incurred_at', startIso)
      .lt('incurred_at', endExclusiveIso);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.expenses);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []).map(
      (r: { incurred_at: string; amount: number; rate_per_usd_snapshot: number }) => ({
        incurredAt: r.incurred_at,
        amount: Number(r.amount),
        ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
      }),
    );
  }
}

// Platform seam: web → Supabase directly; native → offline SQLite.
const impl: IExpenseRepository =
  Platform.OS === 'web' ? new ExpenseRepository() : new OfflineExpenseRepository();

export default impl;
