import type { CreateCustomerPlanPayload } from "@shared/modules/customer/customer-plans/repository/ICustomerPlanRepository";
import type { CreateCustomerPayload } from "@shared/modules/customer/customers/repository/ICustomerRepository";

export type ImportCustomerPayload = CreateCustomerPayload & { id: string };

export type ImportLinePayload = CreateCustomerPlanPayload & { id: string };

export interface PhoneOwner {
  phoneNumber: string;
  name: string;
}

// Online only: one group is ONE server transaction, so it lands whole or not at all.
export interface ICustomerImportRepository {
  findPhoneOwners(): Promise<PhoneOwner[]>;
  importGroup(customers: ImportCustomerPayload[], lines: ImportLinePayload[]): Promise<void>;
  findExistingIds(ids: string[]): Promise<Set<string>>;
}
