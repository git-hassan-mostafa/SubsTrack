import { useEffect } from "react";
import type { Customer } from "@shared/core/types";
import { useCustomerToCollect } from "@shared/modules/transaction/to-collect/hooks/useCustomerToCollect";
import type { OwedDoors } from "../hooks/useOwedDoors";
import { OwingCustomerDialog } from "./OwingCustomerDialog";

interface CustomerToCollectDialogProps {
  customer: Customer;
  doors: OwedDoors;
  onClose: () => void;
}

// Opened from outside the To collect page, so it reads the one customer itself.
export function CustomerToCollectDialog({ customer, doors, onClose }: CustomerToCollectDialogProps) {
  const toCollect = useCustomerToCollect(customer);
  const { refresh } = toCollect;

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <OwingCustomerDialog
      debtor={toCollect.entry}
      doors={doors}
      onClose={onClose}
      loading={toCollect.loading}
      readError={toCollect.error}
      onClearReadError={toCollect.clearError}
    />
  );
}
