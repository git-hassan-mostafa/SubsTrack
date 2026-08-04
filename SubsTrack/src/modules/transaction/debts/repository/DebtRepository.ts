import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import { type BranchFilter } from '@/src/core/constants';
import type { DbCustomDebt, DbDebtPayment } from '@/src/core/types/db';
import type {
  CreateCustomDebtPayload,
  CreateDebtPaymentPayload,
  IDebtRepository,
} from './IDebtRepository';
import { OfflineDebtRepository } from './DebtRepository.offline';

// Joins the customer name (+ branch_id, needed by the inherited branch filter).
const CUSTOM_DEBT_SELECT = '*, customers!inner(name, branch_id)';
const DEBT_PAYMENT_SELECT = '*, customers!inner(name, branch_id)';

export class DebtRepository extends BaseRepository implements IDebtRepository {
  async customDebts(branchFilter: BranchFilter = null): Promise<DbCustomDebt[]> {
    let query = this.db
      .from('custom_debts')
      .select(CUSTOM_DEBT_SELECT)
      .is('voided_at', null)
      .order('incurred_at', { ascending: false });
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.custom_debts);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []) as DbCustomDebt[];
  }

  async debtPayments(branchFilter: BranchFilter = null): Promise<DbDebtPayment[]> {
    let query = this.db
      .from('debt_payments')
      .select(DEBT_PAYMENT_SELECT)
      .is('voided_at', null)
      .order('paid_at', { ascending: false });
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.debt_payments);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []) as DbDebtPayment[];
  }

  // Neither debt table has a branch_id of its own — it comes from the joined
  // customer, which both SELECT constants already fetch.
  private branchOf(row: { customers?: { branch_id?: string | null } | null }): string | null {
    return row.customers?.branch_id ?? null;
  }

  async createCustomDebt(payload: CreateCustomDebtPayload): Promise<DbCustomDebt> {
    const { data, error } = await this.db
      .from('custom_debts')
      .insert({ ...payload, voided_at: null, voided_by: null, void_reason: null })
      .select(CUSTOM_DEBT_SELECT)
      .single();
    if (error) this.handleError(error);
    const created = data as DbCustomDebt;
    await this.audit({
      table: 'custom_debts',
      recordId: created.id,
      action: 'create',
      after: created,
      branchId: this.branchOf(created),
    });
    return created;
  }

  async voidCustomDebt(id: string, voidedBy: string, reason: string | null): Promise<DbCustomDebt> {
    const { data: prior } = await this.db.from('custom_debts').select('*').eq('id', id).maybeSingle();
    const { data, error } = await this.db
      .from('custom_debts')
      .update({ voided_at: new Date().toISOString(), voided_by: voidedBy, void_reason: reason })
      .eq('id', id)
      .is('voided_at', null)
      .select(CUSTOM_DEBT_SELECT)
      .single();
    if (error) this.handleError(error);
    const voided = data as DbCustomDebt;
    await this.audit({
      table: 'custom_debts',
      recordId: id,
      action: 'void',
      before: prior,
      after: voided,
      branchId: this.branchOf(voided),
    });
    return voided;
  }

  async createDebtPayment(payload: CreateDebtPaymentPayload): Promise<DbDebtPayment> {
    const { data, error } = await this.db
      .from('debt_payments')
      .insert({ ...payload, voided_at: null, voided_by: null, void_reason: null })
      .select(DEBT_PAYMENT_SELECT)
      .single();
    if (error) this.handleError(error);
    const created = data as DbDebtPayment;
    await this.audit({
      table: 'debt_payments',
      recordId: created.id,
      action: 'create',
      after: created,
      branchId: this.branchOf(created),
    });
    return created;
  }

  async voidDebtPayment(id: string, voidedBy: string, reason: string | null): Promise<DbDebtPayment> {
    const { data: prior } = await this.db.from('debt_payments').select('*').eq('id', id).maybeSingle();
    const { data, error } = await this.db
      .from('debt_payments')
      .update({ voided_at: new Date().toISOString(), voided_by: voidedBy, void_reason: reason })
      .eq('id', id)
      .is('voided_at', null)
      .select(DEBT_PAYMENT_SELECT)
      .single();
    if (error) this.handleError(error);
    const voided = data as DbDebtPayment;
    await this.audit({
      table: 'debt_payments',
      recordId: id,
      action: 'void',
      before: prior,
      after: voided,
      branchId: this.branchOf(voided),
    });
    return voided;
  }

  async paidAmountsInRange(
    rangeStartIso: string,
    rangeEndExclusiveIso: string,
    branchFilter: BranchFilter = null,
  ): Promise<{ paidAt: string; amount: number; ratePerUsdSnapshot: number }[]> {
    let query = this.db
      .from('debt_payments')
      .select('paid_at, amount, rate_per_usd_snapshot, customers!inner(branch_id)')
      .gte('paid_at', rangeStartIso)
      .lt('paid_at', rangeEndExclusiveIso)
      .is('voided_at', null);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.debt_payments);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []).map(
      (r: { paid_at: string; amount: number; rate_per_usd_snapshot: number }) => ({
        paidAt: r.paid_at,
        amount: Number(r.amount),
        ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
      }),
    );
  }

  async unremittedDebtPayments(
    branchFilter: BranchFilter = null,
    collectorUserId: string | null = null,
  ): Promise<DbDebtPayment[]> {
    let query = this.db
      .from('debt_payments')
      .select(DEBT_PAYMENT_SELECT)
      .is('voided_at', null)
      .is('remitted_at', null)
      .order('paid_at', { ascending: false });
    if (collectorUserId) query = query.eq('received_by_user_id', collectorUserId);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.debt_payments);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []) as DbDebtPayment[];
  }

  async markDebtPaymentsRemitted(ids: string[], remittedBy: string): Promise<void> {
    if (ids.length === 0) return;
    const remittedAt = new Date().toISOString();
    const { error, data } = await this.db
      .from('debt_payments')
      .update({ remitted_at: remittedAt, remitted_by: remittedBy })
      .in('id', ids)
      .is('remitted_at', null)
      .is('voided_at', null)
      // Returned so the trail records only the rows the conditional UPDATE
      // actually moved, not every id the caller passed.
      .select(DEBT_PAYMENT_SELECT);
    if (error) this.handleError(error);
    for (const d of (data ?? []) as DbDebtPayment[]) {
      await this.audit({
        table: 'debt_payments',
        recordId: d.id,
        action: 'update',
        before: { ...d, remitted_at: null, remitted_by: null },
        after: d,
        branchId: this.branchOf(d),
      });
    }
  }
}

// Platform seam: web → Supabase directly; native → offline SQLite.
const impl: IDebtRepository =
  Platform.OS === 'web' ? new DebtRepository() : new OfflineDebtRepository();

export default impl;
