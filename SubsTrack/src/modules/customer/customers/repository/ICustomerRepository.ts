import type { BranchFilter } from '@/src/core/constants';
import type { UnpaidStartRule } from '@/src/core/types';
import type { DbCustomer } from '@/src/core/types/db';

// A customer row with its service lines (each carrying its joined plan).
export type CustomerWithLines = DbCustomer;

/**
 * This month's collection population. `due` = customers the month actually asks
 * money from; `unpaid` = the subset that hasn't paid. Both come from one pass, so
 * the dashboard's progress bar can't mix two different populations — `due`
 * already excludes non-regular, not-yet-started, skipped and not-yet-due lines.
 */
export interface UnpaidMonthCount {
  unpaid: number;
  due: number;
}

export type CreateCustomerPayload = Pick<
  DbCustomer,
  | 'name'
  | 'phone_number'
  | 'address'
  | 'area'
  | 'notes'
  | 'location_url'
  | 'branch_id'
  | 'tenant_id'
  | 'active'
  | 'is_regular'
  | 'cancelled_at'
>;

export interface ICustomerRepository {
  findAll(
    page: number,
    searchQuery?: string,
    branchFilter?: BranchFilter,
  ): Promise<CustomerWithLines[]>;
  findAllForStatus(branchFilter?: BranchFilter): Promise<CustomerWithLines[]>;
  findById(id: string): Promise<CustomerWithLines>;
  create(payload: CreateCustomerPayload): Promise<CustomerWithLines>;
  update(
    id: string,
    payload: Partial<
      Pick<
        DbCustomer,
        'name' | 'phone_number' | 'address' | 'area' | 'notes' | 'location_url' | 'branch_id' | 'is_regular'
      >
    >,
  ): Promise<CustomerWithLines>;
  deactivate(id: string): Promise<CustomerWithLines>;
  reactivate(id: string): Promise<CustomerWithLines>;
  countPayments(id: string): Promise<number>;
  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;
  deactivateMany(ids: string[]): Promise<void>;
  customersWithPayments(ids: string[]): Promise<Set<string>>;
  countAll(branchFilter?: BranchFilter): Promise<number>;
  countActive(branchFilter?: BranchFilter): Promise<number>;
  countUnpaidForMonth(
    billingMonth: string,
    branchFilter?: BranchFilter,
    unpaidRule?: UnpaidStartRule,
  ): Promise<UnpaidMonthCount>;
  countCreatedInRange(start: string, endExclusive: string, branchFilter?: BranchFilter): Promise<number>;
  countCancelledInRange(start: string, endExclusive: string, branchFilter?: BranchFilter): Promise<number>;
}
