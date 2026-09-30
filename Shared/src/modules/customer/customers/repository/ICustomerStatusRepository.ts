import type {
  CustomerStatusRequest,
  CustomerStatusResponse,
} from "@shared/modules/customer/customers/utils/types";

// Online-only: the `customer-status` edge function pages the exact tabs.
export interface ICustomerStatusRepository {
  findPage(request: CustomerStatusRequest): Promise<CustomerStatusResponse>;
}
