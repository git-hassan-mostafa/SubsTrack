import type { BranchFilter } from '@/src/core/constants';
import type { DbCustomer } from '@/src/core/types/db';

// A customer row with its service lines (each carrying its joined plan).
export type CustomerWithLines = DbCustomer;

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
  | 'start_date'
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
  findById(id: string): Promise<CustomerWithLines>;
  create(payload: CreateCustomerPayload): Promise<CustomerWithLines>;
  update(
    id: string,
    payload: Partial<
      Pick<
        DbCustomer,
        'name' | 'phone_number' | 'address' | 'area' | 'notes' | 'location_url' | 'branch_id' | 'start_date' | 'is_regular'
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
  countUnpaidForMonth(billingMonth: string, branchFilter?: BranchFilter): Promise<number>;
  // Customers whose created_at / cancelled_at falls in [start, endExclusive) —
  // the dashboard's "new" and "cancelled" this-month growth counters.
  countCreatedInRange(start: string, endExclusive: string, branchFilter?: BranchFilter): Promise<number>;
  countCancelledInRange(start: string, endExclusive: string, branchFilter?: BranchFilter): Promise<number>;
}
