import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import { PAGE_SIZE, type BranchFilter } from '@/src/core/constants';
import type { UnpaidStartRule } from '@/src/core/types';
import type { DbCustomer } from '@/src/core/types/db';
import { isNotDueYet } from '@/src/modules/customer/customer-payments/utils/monthDueRules';
import type {
  CreateCustomerPayload,
  CustomerWithLines,
  ICustomerRepository,
  UnpaidMonthCount,
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

  async findAllForStatus(branchFilter: BranchFilter = null): Promise<CustomerWithLines[]> {
    let query = this.db
      .from('customers')
      .select(SELECT)
      .eq('active', true)
      .eq('is_regular', true)
      .order('name');
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.customers);
    const { data, error } = await query;
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
    const created = data as CustomerWithLines;
    this.audit({
      table: 'customers',
      recordId: created.id,
      action: 'create',
      after: created,
      branchId: created.branch_id,
    });
    return created;
  }

  /**
   * Every single-row customer patch funnels through here: read the row first (an
   * UPDATE cannot return old values), apply the patch, record the diff.
   */
  private async patch(
    id: string,
    values: Record<string, unknown>,
    action: 'update' | 'restore',
  ): Promise<CustomerWithLines> {
    const { data: prior } = await this.db.from('customers').select('*').eq('id', id).maybeSingle();
    const { data, error } = await this.db
      .from('customers')
      .update(values)
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) this.handleError(error);
    const updated = data as CustomerWithLines;
    this.audit({
      table: 'customers',
      recordId: id,
      action,
      before: prior,
      after: updated,
      branchId: updated.branch_id,
    });
    return updated;
  }

  async update(
    id: string,
    payload: Partial<Pick<DbCustomer, 'name' | 'phone_number' | 'address' | 'area' | 'notes' | 'location_url' | 'branch_id' | 'is_regular'>>,
  ): Promise<CustomerWithLines> {
    return this.patch(id, payload, 'update');
  }

  async deactivate(id: string): Promise<CustomerWithLines> {
    return this.patch(id, { active: false, cancelled_at: new Date().toISOString() }, 'update');
  }

  async reactivate(id: string): Promise<CustomerWithLines> {
    return this.patch(id, { active: true, cancelled_at: null }, 'restore');
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
    await this.deleteMany([id]);
  }

  // Hard-delete many customers in one statement (payments cascade via
  // ON DELETE CASCADE). Callers must have already partitioned out the ones
  // with payment history — those get soft-deleted instead.
  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    // Snapshot before the rows are gone — a delete's whole value in the trail is
    // the copy of what was removed. The cascaded children get no entry of their
    // own; the customer entry is the record of the whole removal.
    const { data: prior } = await this.db.from('customers').select('*').in('id', ids);
    const { error } = await this.db.from('customers').delete().in('id', ids);
    if (error) this.handleError(error);
    for (const c of (prior ?? []) as DbCustomer[]) {
      this.audit({
        table: 'customers',
        recordId: c.id,
        action: 'delete',
        before: c,
        branchId: c.branch_id,
      });
    }
  }

  // Soft-delete many customers in one statement — mirrors `deactivate`.
  async deactivateMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const cancelledAt = new Date().toISOString();
    const { error, data } = await this.db
      .from('customers')
      .update({ active: false, cancelled_at: cancelledAt })
      .in('id', ids)
      .select('*');
    if (error) this.handleError(error);
    for (const c of (data ?? []) as DbCustomer[]) {
      this.audit({
        table: 'customers',
        recordId: c.id,
        action: 'update',
        before: { ...c, active: true, cancelled_at: null },
        after: c,
        branchId: c.branch_id,
      });
    }
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

  async countCreatedInRange(
    start: string,
    endExclusive: string,
    branchFilter: BranchFilter = null,
  ): Promise<number> {
    let query = this.db
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', start)
      .lt('created_at', endExclusive);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.customers);
    const { count, error } = await query;
    if (error) this.handleError(error);
    return count ?? 0;
  }

  async countCancelledInRange(
    start: string,
    endExclusive: string,
    branchFilter: BranchFilter = null,
  ): Promise<number> {
    let query = this.db
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .gte('cancelled_at', start)
      .lt('cancelled_at', endExclusive);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.customers);
    const { count, error } = await query;
    if (error) this.handleError(error);
    return count ?? 0;
  }

  async countUnpaidForMonth(
    billingMonth: string,
    branchFilter: BranchFilter = null,
    unpaidRule: UnpaidStartRule = 'month_start',
  ): Promise<UnpaidMonthCount> {
    // Counts, over active regular customers with at least one active service
    // line: how many are asked for money this month (`due`) and how many of
    // those have had NO money reach it (`unpaid`). Lines (and the charges
    // below) inherit the customer's branch via the inner join, so the branch
    // filter scopes both. Includes multi-month bills still covering it.
    const [year, monthStr] = billingMonth.split('-').map(Number);
    const cutoffDate = new Date(year, monthStr - 1 - 12, 1);
    const cutoff = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-01`;
    const target = new Date(billingMonth);

    // Coverage is decided by MONEY, never by a bill existing: a charge sitting
    // at 0 collected (a void emptied it) must read exactly like a month that was
    // never touched. Reading from the ITEM side makes that automatic — every
    // collection_item is > 0 by constraint, so one returned row IS the coverage.
    let coverQuery = this.db
      .from('collection_items')
      .select(
        'charges!inner(customer_plan_id, billing_month, duration_months, kind, voided_at, customers!inner(branch_id)), collections!inner(voided_at)',
      )
      .eq('charges.kind', 'month')
      .lte('charges.billing_month', billingMonth)
      .gte('charges.billing_month', cutoff)
      .is('charges.voided_at', null)
      .is('collections.voided_at', null);
    coverQuery = this.applyBranchFilter(coverQuery, branchFilter, {
      kind: 'inherited',
      joinedTable: 'charges.customers',
    });
    const { data: coverRows, error: pErr } = await coverQuery;
    if (pErr) this.handleError(pErr);

    type CoverRow = {
      charges: { customer_plan_id: string; billing_month: string; duration_months: number };
    };
    const coveredLineIds = new Set(
      ((coverRows as unknown as CoverRow[] | null) ?? [])
        .map((r) => r.charges)
        .filter((c) => {
          const start = new Date(c.billing_month);
          const end = new Date(start);
          end.setMonth(end.getMonth() + c.duration_months - 1);
          return end >= target;
        })
        .map((c) => c.customer_plan_id),
    );

    // Lines whose month is skipped — nothing is owed, so they never count.
    const { data: skipRows, error: sErr } = await this.db
      .from('skipped_months')
      .select('customer_plan_id')
      .eq('billing_month', billingMonth)
      .eq('skipped', true);
    if (sErr) this.handleError(sErr);
    const skippedLineIds = new Set(
      ((skipRows as { customer_plan_id: string }[] | null) ?? []).map((r) => r.customer_plan_id),
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
    const dueCustomers = new Set<string>();
    for (const l of ((lines as { id: string; customer_id: string; start_date: string }[] | null) ?? [])) {
      const [sy, sm] = l.start_date.split('-').map(Number);
      if (new Date(`${sy}-${String(sm).padStart(2, '0')}-01`) > target) continue; // not started yet
      if (skippedLineIds.has(l.id)) continue; // skipped month — not owed
      // Billing day not reached yet — owes nothing this month, same as the grid.
      if (isNotDueYet(unpaidRule, year, monthStr, l.start_date)) continue;
      dueCustomers.add(l.customer_id);
      if (!coveredLineIds.has(l.id)) unpaidCustomers.add(l.customer_id);
    }
    return { unpaid: unpaidCustomers.size, due: dueCustomers.size };
  }
}

// Platform seam: web → Supabase directly (unchanged); native → offline SQLite.
const impl: ICustomerRepository =
  Platform.OS === 'web' ? new CustomerRepository() : new OfflineCustomerRepository();

export default impl;
