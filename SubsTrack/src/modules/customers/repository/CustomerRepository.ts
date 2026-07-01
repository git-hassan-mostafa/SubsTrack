import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import { PAGE_SIZE, type BranchFilter } from '@/src/core/constants';
import type { DbCustomer } from '@/src/core/types/db';
import type {
  CreateCustomerPayload,
  CustomerWithLines,
  ICustomerRepository,
} from './ICustomerRepository';
import { OfflineCustomerRepository } from './CustomerRepository.offline';

// Selects the customer plus its service lines and each line's plan.
const SELECT = '*, customer_plans(*, plans(*))';

export class CustomerRepository extends BaseRepository implements ICustomerRepository {
  async findAll(
    page: number,
    searchQuery?: string,
    branchFilter: BranchFilter = null,
  ): Promise<CustomerWithLines[]> {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    // Strip PostgREST-reserved chars that break .or() parsing.
    const q = (searchQuery ?? '').trim().replace(/[,()]/g, '');
    let query = this.db
      .from('customers')
      .select(SELECT)
      .order('name');
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.customers);
    if (q) {
      query = query.or(
        `name.ilike.%${q}%,phone_number.ilike.%${q}%,address.ilike.%${q}%,area.ilike.%${q}%`,
      );
    }
    const { data, error } = await query.range(from, to);
    if (error) this.handleError(error);
    return (data ?? []) as CustomerWithLines[];
  }

  async findById(id: string): Promise<CustomerWithLines> {
    const { data, error } = await this.db
      .from('customers')
      .select(SELECT)
      .eq('id', id)
      .single();
    if (error) this.handleError(error);
    if (!data) throw new Error('Customer not found');
    return data as CustomerWithLines;
  }

  async create(payload: CreateCustomerPayload): Promise<CustomerWithLines> {
    const { data, error } = await this.db
      .from('customers')
      .insert(payload)
      .select(SELECT)
      .single();
    if (error) this.handleError(error);
    return data as CustomerWithLines;
  }

  async update(
    id: string,
    payload: Partial<Pick<DbCustomer, 'name' | 'phone_number' | 'address' | 'area' | 'notes' | 'branch_id' | 'start_date' | 'is_regular'>>,
  ): Promise<CustomerWithLines> {
    const { data, error } = await this.db
      .from('customers')
      .update(payload)
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) this.handleError(error);
    return data as CustomerWithLines;
  }

  async deactivate(id: string): Promise<CustomerWithLines> {
    const { data, error } = await this.db
      .from('customers')
      .update({ active: false, cancelled_at: new Date().toISOString() })
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) this.handleError(error);
    return data as CustomerWithLines;
  }

  async reactivate(id: string): Promise<CustomerWithLines> {
    const { data, error } = await this.db
      .from('customers')
      .update({ active: true, cancelled_at: null })
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) this.handleError(error);
    return data as CustomerWithLines;
  }

  async countPayments(id: string): Promise<number> {
    const { count, error } = await this.db
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', id);
    if (error) this.handleError(error);
    return count ?? 0;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('customers').delete().eq('id', id);
    if (error) this.handleError(error);
  }

  // Hard-delete many customers in one statement (payments cascade via
  // ON DELETE CASCADE). Callers must have already partitioned out the ones
  // with payment history — those get soft-deleted instead.
  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.db.from('customers').delete().in('id', ids);
    if (error) this.handleError(error);
  }

  // Soft-delete many customers in one statement — mirrors `deactivate`.
  async deactivateMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.db
      .from('customers')
      .update({ active: false, cancelled_at: new Date().toISOString() })
      .in('id', ids);
    if (error) this.handleError(error);
  }

  // The subset of the given customers that have any payment — one query.
  async customersWithPayments(ids: string[]): Promise<Set<string>> {
    return this.referencedIdsIn('payments', 'customer_id', ids);
  }

  async countAll(branchFilter: BranchFilter = null): Promise<number> {
    let query = this.db
      .from('customers')
      .select('id', { count: 'exact', head: true });
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.customers);
    const { count, error } = await query;
    if (error) this.handleError(error);
    return count ?? 0;
  }

  async countActive(branchFilter: BranchFilter = null): Promise<number> {
    let query = this.db
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('active', true);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.customers);
    const { count, error } = await query;
    if (error) this.handleError(error);
    return count ?? 0;
  }

  async countUnpaidForMonth(
    billingMonth: string,
    branchFilter: BranchFilter = null,
  ): Promise<number> {
    // Count active regular customers with at least one active service line that
    // has NO payment covering the given month. Lines (and the payments below)
    // inherit the customer's branch via the inner join, so the branch filter
    // scopes both. Includes multi-month payments that still cover this month.
    const [year, monthStr] = billingMonth.split('-').map(Number);
    const cutoffDate = new Date(year, monthStr - 1 - 12, 1);
    const cutoff = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-01`;
    const target = new Date(billingMonth);

    // amount_paid = 0 is excluded — a zero-paid partial is treated as unpaid.
    let paymentsQuery = this.db
      .from('payments')
      .select('customer_plan_id, billing_month, duration_months, amount_paid, customers!inner(branch_id)')
      .lte('billing_month', billingMonth)
      .gte('billing_month', cutoff)
      .is('voided_at', null)
      .gt('amount_paid', 0);
    paymentsQuery = this.applyBranchFilter(paymentsQuery, branchFilter, this.BRANCH_SCOPES.payments);
    const { data: payments, error: pErr } = await paymentsQuery;
    if (pErr) this.handleError(pErr);

    const coveredLineIds = new Set(
      ((payments as { customer_plan_id: string; billing_month: string; duration_months: number }[] | null) ?? [])
        .filter((r) => {
          const start = new Date(r.billing_month);
          const end = new Date(start);
          end.setMonth(end.getMonth() + r.duration_months - 1);
          return end >= target;
        })
        .map((r) => r.customer_plan_id),
    );

    // Active lines on active, regular customers (started by this month).
    let linesQuery = this.db
      .from('customer_plans')
      .select('id, customer_id, start_date, customers!inner(active, is_regular, branch_id)')
      .eq('active', true)
      .eq('customers.active', true)
      .eq('customers.is_regular', true);
    linesQuery = this.applyBranchFilter(linesQuery, branchFilter, this.BRANCH_SCOPES.customer_plans);
    const { data: lines, error: lErr } = await linesQuery;
    if (lErr) this.handleError(lErr);

    const unpaidCustomers = new Set<string>();
    for (const l of ((lines as { id: string; customer_id: string; start_date: string }[] | null) ?? [])) {
      const [sy, sm] = l.start_date.split('-').map(Number);
      if (new Date(`${sy}-${String(sm).padStart(2, '0')}-01`) > target) continue; // not started yet
      if (!coveredLineIds.has(l.id)) unpaidCustomers.add(l.customer_id);
    }
    return unpaidCustomers.size;
  }
}

// Platform seam: web → Supabase directly (unchanged); native → offline SQLite.
const impl: ICustomerRepository =
  Platform.OS === 'web' ? new CustomerRepository() : new OfflineCustomerRepository();

export default impl;
