import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import type { Customer } from "@shared/core/types";
import type { TableAction } from "@/shared/table/tableAction";
import { CustomerHistoryDialog } from "@/modules/admin/audit/RecordHistoryDialog";

interface CustomerHistoryAction {
  action: (customer: Customer) => TableAction;
  dialog: ReactNode;
}

// The whole customer story (profile, lines, months), not just the customer row.
export function useCustomerHistoryAction(): CustomerHistoryAction {
  const { t } = useTranslation();
  const [target, setTarget] = useState<Customer | null>(null);

  return {
    action: (customer) => ({
      key: "history",
      group: "history",
      label: t("audit.customer_history_action"),
      icon: HistoryOutlined,
      onClick: () => setTarget(customer),
    }),
    dialog: target ? (
      <CustomerHistoryDialog customer={target} onClose={() => setTarget(null)} />
    ) : null,
  };
}
