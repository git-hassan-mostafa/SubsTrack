import { useCallback, useState, type ReactNode } from "react";
import type { Charge, Collection, CollectionItem } from "@shared/core/types";
import { chargeService } from "@shared/modules/ledger/services/ChargeService";
import type { BillRecipient } from "@/modules/invoicing/useSendBillReceipt";
import { BillDialog } from "./BillDialog";

interface OpenedBill {
  charge: Charge;
  label: string;
  customerName: string | null;
  recipient: BillRecipient | null;
}

export interface BillDialogDoor {
  openItem: (
    item: CollectionItem,
    label: string,
    customerName: string | null,
    recipient?: BillRecipient | null,
  ) => Promise<void>;
  loadingItemId: string | null;
  error: string | null;
  clearError: () => void;
  dialog: ReactNode;
}

// The bill behind a payment, read-only; a sale shows as a plain bill for now.
export function useBillDialog(
  onChanged?: (voided: Collection, replacement?: Collection) => void,
): BillDialogDoor {
  const [bill, setBill] = useState<OpenedBill | null>(null);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);

  const openItem = useCallback<BillDialogDoor["openItem"]>(async (item, label, customerName, recipient = null) => {
    setError(null);
    if (item.charge) {
      setBill({ charge: item.charge, label, customerName, recipient });
      return;
    }
    setLoadingItemId(item.id);
    try {
      const charge = await chargeService.getById(item.chargeId);
      if (charge) setBill({ charge, label, customerName, recipient });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingItemId(null);
    }
  }, []);

  return {
    openItem,
    loadingItemId,
    error,
    clearError,
    dialog: bill ? (
      <BillDialog
        charge={bill.charge}
        label={bill.label}
        customerName={bill.customerName}
        recipient={bill.recipient}
        onClose={() => setBill(null)}
        onChanged={onChanged}
      />
    ) : null,
  };
}
