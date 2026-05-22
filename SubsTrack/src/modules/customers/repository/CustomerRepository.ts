import { BaseRepository } from '@/src/core/utils/BaseRepository';
import { PAGE_SIZE, type BranchFilter } from '@/src/core/constants';
import type { DbCustomer } from '@/src/core/types/db';
import { applyBranchFilter, BRANCH_SCOPES } from '@/src/shared/lib/branchFilter';

type CustomerWithPlan = DbCustomer & { plans: DbCustomer['plans'] };

type CreateCustomerPayload = Pick<
  DbCustomer,
  | 'name'
  | 'phone_number'
  | 'address'
  | 'area'
  | 'notes'
  | 'plan_id'
  | 'branch_id'
  | 'tenant_id'
  | 'start_date'
  | 'active'
  | 'is_regular'
  | 'cancelled_at'
>;

export class CustomerRepository extends BaseRepository {
  async findAll(
    page: number,
    searchQuery?: string,
    branchFilter: BranchFilter = null,
  ): Promise<CustomerWithPlan[]> {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    // Strip PostgREST-reserved chars that break .or() parsing.
    const q = (searchQuery ?? '').trim().replace(/[,()]/g, '');
    let query = this.db
      .from('customers')
      .select('*, plans(*)')
      .order('name');
    query = applyBranchFilter(query, branchFilter, BRANCH_SCOPES.customers);
    if (q) {
      query = query.or(
        `name.ilike.%${q}%,phone_number.ilike.%${q}%,address.ilike.%${q}%,area.ilike.%${q}%`,
      );
    }
    const { data, error } = await query.range(from, to);
    if (error) this.handleError(error);
    return (data ?? []) as CustomerWithPlan[];
  }

  async findById(id: string): Promise<CustomerWithPlan> {
    const { data, error } = await this.db
      .from('customers')
      .select('*, plans(*)')
      .eq('id', id)
      .single();
    if (error) this.handleError(error);
    if (!data) throw new Error('Customer not found');
    return data as CustomerWithPlan;
  }

  async create(payload: CreateCustomerPayload): Promise<CustomerWithPlan> {
    const { data, error } = await this.db
      .from('customers')
      .insert(payload)
      .select('*, plans(*)')
      .single();
    if (error) this.handleError(error);
    return data as CustomerWithPlan;
  }

  async update(
    id: string,
    payload: Partial<Pick<DbCustomer, 'name' | 'phone_number' | 'address' | 'area' | 'notes' | 'plan_id' | 'branch_id' | 'start_date' | 'is_regular'>>,
  ): Promise<CustomerWithPlan> {
    const { data, error } = await this.db
      .from('customers')
      .update(payload)
      .eq('id', id)
      .select('*, plans(*)')
      .single();
    if (error) this.handleError(error);
    return data as CustomerWithPlan;
  }

  async deactivate(id: string): Promise<CustomerWithPlan> {
    const { data, error } = await this.db
      .from('customers')
      .update({ active: false, cancelled_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, plans(*)')
      .single();
    if (error) this.handleError(error);
    return data as CustomerWithPlan;
  }

  async reactivate(id: string): Promise<CustomerWithPlan> {
    const { data, error } = await this.db
      .from('customers')
      .update({ active: true, cancelled_at: null })
      .eq('id', id)
      .select('*, plans(*)')
      .single();
    if (error) this.handleError(error);
    return data as CustomerWithPlan;
  }

  async countAll(branchFilter: BranchFilter = null): Promise<number> {
    let query = this.db
      .from('customers')
      .select('id', { count: 'exact', head: true });
    query = applyBranchFilter(query, branchFilter, BRANCH_SCOPES.customers);
    const { count, error } = await query;
    if (error) this.handleError(error);
    return count ?? 0;
  }

  async countActive(branchFilter: BranchFilter = null): Promise<number> {
    let query = this.db
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('active', true);
    query = applyBranchFilter(query, branchFilter, BRANCH_SCOPES.customers);
    const { count, error } = await query;
    if (error) this.handleError(error);
    return count ?? 0;
  }

  async countUnpaidForMonth(
    billingMonth: string,
    branchFilter: BranchFilter = null,
  ): Promise<number> {
    // Count active regular customers who do NOT have a payment covering the given month.
    // Includes multi-month payments that started earlier but still cover this month.
    const [year, monthStr] = billingMonth.split('-').map(Number);
    const cutoffDate = new Date(year, monthStr - 1 - 12, 1);
    const cutoff = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-01`;
    const target = new Date(billingMonth);

    // amount_paid = 0 is excluded — a zero-paid partial is treated as unpaid.
    // Payments inherit the customer's branch via the inner join, so the same
    // branch filter that scopes the customer count below also scopes which
    // payments we read here.
    let paymentsQuery = this.db
      .from('payments')
      .select('customer_id, billing_month, duration_months, amount_paid, customers!inner(branch_id)')
      .lte('billing_month', billingMonth)
      .gte('billing_month', cutoff)
      .is('voided_at', null)
      .gt('amount_paid', 0);
    paymentsQuery = applyBranchFilter(paymentsQuery, branchFilter, BRANCH_SCOPES.payments);
    const { data: payments, error: pErr } = await paymentsQuery;
    if (pErr) this.handleError(pErr);

    type PaymentRow = {
      customer_id: string;
      billing_month: string;
      duration_months: number;
    };
    const paidIds = new Set(
      (payments as PaymentRow[] | null ?? [])
        .filter((r) => {
          const start = new Date(r.billing_month);
          const end = new Date(start);
          end.setMonth(end.getMonth() + r.duration_months - 1);
          return end >= target;
        })
        .map((r) => r.customer_id),
    );

    let activeQuery = this.db
      .from('customers')
      .select('id')
      .eq('active', true)
      .eq('is_regular', true);
    activeQuery = applyBranchFilter(activeQuery, branchFilter, BRANCH_SCOPES.customers);
    const { data: active, error: cErr } = await activeQuery;
    if (cErr) this.handleError(cErr);

    return (active ?? []).filter((c: { id: string }) => !paidIds.has(c.id)).length;
  }
}
