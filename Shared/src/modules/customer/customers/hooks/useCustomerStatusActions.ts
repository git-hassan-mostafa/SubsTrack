import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Customer } from "@shared/core/types";
import { confirm } from "@shared/shared/lib/confirm";
import { useCustomerSlice } from "@shared/state/hooks/useCustomerSlice";

export interface CustomerRemoval {
  removed: boolean;
  hardDeleted: boolean;
}

const NOT_REMOVED: CustomerRemoval = { removed: false, hardDeleted: false };

// `hardDeleted` is false when history kept the customer as a cancelled row.
export function useCustomerStatusActions() {
  const { t } = useTranslation();
  const deactivateCustomer = useCustomerSlice((s) => s.deactivateCustomer);
  const reactivateCustomer = useCustomerSlice((s) => s.reactivateCustomer);
  const deleteCustomer = useCustomerSlice((s) => s.deleteCustomer);
  const bulkDeleteCustomers = useCustomerSlice((s) => s.bulkDeleteCustomers);
  const [busy, setBusy] = useState(false);

  const toggleActive = useCallback(
    async (customer: Customer): Promise<Customer | null> => {
      const label = customer.active ? t("customers.deactivate") : t("customers.activate");
      let saved: Customer | null = null;
      await confirm({
        title: customer.active ? t("customers.deactivate_title") : t("customers.reactivate_title"),
        message: customer.active
          ? t("customers.deactivate_message", { name: customer.name })
          : t("customers.reactivate_message", { name: customer.name }),
        confirmLabel: label,
        destructive: customer.active,
        onConfirm: async () => {
          saved = customer.active
            ? await deactivateCustomer(customer)
            : await reactivateCustomer(customer);
        },
      });
      return saved;
    },
    [t, deactivateCustomer, reactivateCustomer],
  );

  const remove = useCallback(
    async (customers: Customer[]): Promise<CustomerRemoval> => {
      if (customers.length === 0) return NOT_REMOVED;
      const single = customers.length === 1 ? customers[0] : null;
      let result = NOT_REMOVED;
      await confirm({
        title: single
          ? t("customers.delete_title")
          : t("customers.bulk_delete_title", { count: customers.length }),
        message: single
          ? t("customers.delete_message", { name: single.name })
          : t("customers.bulk_delete_message", { count: customers.length }),
        confirmLabel: t("common.delete"),
        destructive: true,
        onConfirm: async () => {
          setBusy(true);
          try {
            if (single) {
              const mode = await deleteCustomer(single);
              if (mode) result = { removed: true, hardDeleted: mode === "hard" };
              return;
            }
            if (await bulkDeleteCustomers(customers)) {
              result = { removed: true, hardDeleted: false };
            }
          } finally {
            setBusy(false);
          }
        },
      });
      return result;
    },
    [t, deleteCustomer, bulkDeleteCustomers],
  );

  return { toggleActive, remove, busy };
}
