import { useTranslation } from "react-i18next";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import PauseCircleOutlined from "@mui/icons-material/PauseCircleOutlined";
import PlayCircleOutlined from "@mui/icons-material/PlayCircleOutlined";
import type { Customer } from "@shared/core/types";
import { confirm } from "@shared/shared/lib/confirm";
import { useCustomerSlice } from "@shared/state/hooks/useCustomerSlice";
import type { TableAction } from "@/shared/table/tableAction";

// `hardDeleted` is false when history kept the customer as a cancelled row.
export function useCustomerAdminActions() {
  const { t } = useTranslation();
  const deactivateCustomer = useCustomerSlice((s) => s.deactivateCustomer);
  const reactivateCustomer = useCustomerSlice((s) => s.reactivateCustomer);
  const deleteCustomer = useCustomerSlice((s) => s.deleteCustomer);
  const bulkDeleteCustomers = useCustomerSlice((s) => s.bulkDeleteCustomers);

  const toggleActive = (customer: Customer, onSaved?: () => void): TableAction => ({
    key: "toggle-active",
    group: "status",
    label: customer.active ? t("customers.deactivate") : t("customers.activate"),
    icon: customer.active ? PauseCircleOutlined : PlayCircleOutlined,
    onClick: () =>
      void confirm({
        title: customer.active ? t("customers.deactivate_title") : t("customers.reactivate_title"),
        message: customer.active
          ? t("customers.deactivate_message", { name: customer.name })
          : t("customers.reactivate_message", { name: customer.name }),
        confirmLabel: customer.active ? t("customers.deactivate") : t("customers.activate"),
        destructive: customer.active,
        onConfirm: async () => {
          const saved = customer.active
            ? await deactivateCustomer(customer)
            : await reactivateCustomer(customer);
          if (saved) onSaved?.();
        },
      }),
  });

  const remove = (customers: Customer[], onDeleted?: (hardDeleted: boolean) => void): TableAction => {
    const single = customers.length === 1 ? customers[0] : null;
    return {
      key: "delete",
      group: "danger",
      label: t("common.delete"),
      icon: DeleteOutlined,
      destructive: true,
      onClick: () =>
        void confirm({
          title: single ? t("customers.delete_title") : t("customers.bulk_delete_title", { count: customers.length }),
          message: single
            ? t("customers.delete_message", { name: single.name })
            : t("customers.bulk_delete_message", { count: customers.length }),
          confirmLabel: t("common.delete"),
          destructive: true,
          onConfirm: async () => {
            if (single) {
              const mode = await deleteCustomer(single);
              if (mode) onDeleted?.(mode === "hard");
              return;
            }
            if (await bulkDeleteCustomers(customers)) onDeleted?.(false);
          },
        }),
    };
  };

  return { toggleActive, remove };
}
