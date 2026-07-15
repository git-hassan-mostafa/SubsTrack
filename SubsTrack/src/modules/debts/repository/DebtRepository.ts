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
      .insert({ ...payload, voided_at: null, voided_by: null, void_reason: null })
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
    const { error } = await this.db
      .from('debt_payments')
      .update({ remitted_at: new Date().toISOString(), remitted_by: remittedBy })
      .in('id', ids)
      .is('remitted_at', null)
      .is('voided_at', null);
    if (error) this.handleError(error);
  }
}

// Platform seam: web → Supabase directly; native → offline SQLite.
const impl: IDebtRepository =
  Platform.OS === 'web' ? new DebtRepository() : new OfflineDebtRepository();

export default impl;
