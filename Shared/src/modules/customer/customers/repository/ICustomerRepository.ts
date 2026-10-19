import type { BranchFilter } from "@shared/core/constants";
import type { DbCustomer } from "@shared/core/types/db";

// A customer row with its service lines (each carrying its joined plan).
export type CustomerWithLines = DbCustomer;

export type CreateCustomerPayload = Pick<
  DbCustomer,
  | "name"
  | "phone_number"
  | "address"
  | "area"
  | "notes"
  | "location_url"
  | "branch_id"
  | "tenant_id"
  | "active"
  | "is_regular"
  | "cancelled_at"
  | "portal_password"
  | "portal_enabled"
>;

export interface ICustomerRepository {
  findAll(
    page: number,
    searchQuery?: string,
    branchFilter?: BranchFilter,
  ): Promise<CustomerWithLines[]>;
  findAllForStatus(branchFilter?: BranchFilter): Promise<CustomerWithLines[]>;
  findEveryWithLines(branchFilter?: BranchFilter): Promise<CustomerWithLines[]>;
  findById(id: string): Promise<CustomerWithLines>;
  create(payload: CreateCustomerPayload): Promise<CustomerWithLines>;
  update(
    id: string,
    payload: Partial<
      Pick<
        DbCustomer,
        | "name"
        | "phone_number"
        | "address"
        | "area"
        | "notes"
        | "location_url"
        | "branch_id"
        | "is_regular"
        | "portal_password"
        | "portal_enabled"
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
  countCreatedInRange(
    start: string,
    endExclusive: string,
    branchFilter?: BranchFilter,
  ): Promise<number>;
  countCancelledInRange(
    start: string,
    endExclusive: string,
    branchFilter?: BranchFilter,
  ): Promise<number>;
}
