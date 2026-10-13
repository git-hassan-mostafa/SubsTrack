import type { Customer, CustomerStatus } from "@shared/core/types";
import {
  customerFlags,
  type CustomerFlag,
} from "@shared/modules/customer/customers/utils/customerFlags";

export type CustomerPill = CustomerFlag | "inactive" | "non_regular" | "to_collect";

// Inactive and non-regular REPLACE the payment flags; To collect always rides along.
export function customerPills(
  customer: Pick<Customer, "active" | "isRegular">,
  status: CustomerStatus | null,
  hasToCollect: boolean,
): CustomerPill[] {
  const pills: CustomerPill[] = !customer.active
    ? ["inactive"]
    : !customer.isRegular
      ? ["non_regular"]
      : customerFlags(status);
  return hasToCollect ? [...pills, "to_collect"] : pills;
}
