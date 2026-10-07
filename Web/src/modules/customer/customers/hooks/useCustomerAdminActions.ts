import type { Customer } from "@shared/core/types";
import {
  useCustomerStatusActions,
  type CustomerRemoval,
} from "@shared/modules/customer/customers/hooks/useCustomerStatusActions";
import { markCustomersTableStale, patchCustomerRow } from "@/state/customersTable";

// The Shared confirm flows, then the customers table follows the saved row.
export function useCustomerAdminActions() {
  const status = useCustomerStatusActions();

  const toggleActive = async (customer: Customer) => {
    const saved = await status.toggleActive(customer);
    if (saved) void patchCustomerRow(saved.id);
  };

  const remove = async (customers: Customer[]): Promise<CustomerRemoval> => {
    const result = await status.remove(customers);
    if (result.removed) markCustomersTableStale();
    return result;
  };

  return { toggleActive, remove, busy: status.busy };
}
