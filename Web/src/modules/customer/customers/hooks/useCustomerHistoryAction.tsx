import { useState, type ReactNode } from "react";
import type { Customer } from "@shared/core/types";
import { CustomerHistoryDialog } from "@/modules/admin/audit/components/RecordHistoryDialog";

interface CustomerHistory {
  open: (customer: Customer) => void;
  dialog: ReactNode;
}

// The whole customer story (profile, lines, months), not just the customer row.
export function useCustomerHistoryAction(): CustomerHistory {
  const [target, setTarget] = useState<Customer | null>(null);

  return {
    open: setTarget,
    dialog: target ? (
      <CustomerHistoryDialog customer={target} onClose={() => setTarget(null)} />
    ) : null,
  };
}
