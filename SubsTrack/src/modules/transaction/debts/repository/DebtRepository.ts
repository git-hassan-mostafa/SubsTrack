import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import { type BranchFilter } from '@/src/core/constants';
import type { DbCustomDebt, DbDebtPayment } from '@/src/core/types/db';
import { custodyValues } from '@/src/modules/wallet/utils/custodyValues';
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

  // Not audited: both debt tables are append-only + voidable, so the Debts view is
  // already their history. See docs/features.md → Audit Trail.
  async createCustomDebt(payload: CreateCustomDebtPayload): Promise<DbCustomDebt> {
    const { data, error } = await this.db
      .from('custom_debts')
      .insert({ ...payload, voided_at: null, voided_by: null, void_reason: null })
      .select(CUSTOM_DEBT_SELECT)
      .single();
    if (error) this.handleError(error);
    return data as DbCustomDebt;
  }

  async voidCustomDebt(id: string, voidedBy: string, reason: string | null): Promise<DbCustomDebt> {
    const { data, error } = await this.db
      .from('custom_debts')
      .update({ voided_at: new Date().toISOString(), voided_by: voidedBy, void_reason: reason })
      .eq('id', id)
      .is('voided_at', null)
      .select(CUSTOM_DEBT_SELECT)
      .single();
    if (error) this.handleError(error);
    return data as DbCustomDebt;
  }

  async createDebtPayment(payload: CreateDebtPaymentPayload): Promise<DbDebtPayment> {
    const { data, error } = await this.db
      .from('debt_payments')
      .insert({
        ...payload,
        voided_at: null,
        voided_by: null,
        void_reason: null,
        // The cash starts in the receiving user's wallet.
        held_by_user_id: payload.received_by_user_id,
      })
      .select(DEBT_PAYMENT_SELECT)
      .single();
    if (error) this.handleError(error);
    return data as DbDebtPayment;
  }

  async voidDebtPayment(id: string, voidedBy: string, reason: string | null): Promise<DbDebtPayment> {
    const { data, error } = await this.db
      .from('debt_payments')
      .update({ voided_at: new Date().toISOString(), voided_by: voidedBy, void_reason: reason })
      .eq('id', id)
      .is('voided_at', null)
      .select(DEBT_PAYMENT_SELECT)
      .single();
    if (error) this.handleError(error);
    return data as DbDebtPayment;
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

  async heldDebtPayments(
    branchFilter: BranchFilter = null,
    holderUserId: string | null = null,
  ): Promise<DbDebtPayment[]> {
    let query = this.db
      .from('debt_payments')
      .select(DEBT_PAYMENT_SELECT)
      .is('voided_at', null)
      .not('held_by_user_id', 'is', null)
      .order('paid_at', { ascending: false });
    if (holderUserId) query = query.eq('held_by_user_id', holderUserId);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.debt_payments);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []) as DbDebtPayment[];
  }

  async transferDebtPaymentCustody(
    ids: string[],
    fromUserId: string,
    toUserId: string | null,
    actorUserId: string,
  ): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.db
      .from('debt_payments')
      .update(custodyValues(toUserId, actorUserId))
      .in('id', ids)
      // Guarded on the current holder — see PaymentRepository.transferCustody.
      .eq('held_by_user_id', fromUserId)
      .is('voided_at', null);
    if (error) this.handleError(error);
  }
}

// Platform seam: web → Supabase directly; native → offline SQLite.
const impl: IDebtRepository =
  Platform.OS === 'web' ? new DebtRepository() : new OfflineDebtRepository();

export default impl;
