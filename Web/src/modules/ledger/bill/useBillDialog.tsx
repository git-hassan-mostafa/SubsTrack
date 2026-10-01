import { useCallback, useState, type ReactNode } from "react";
import type { Charge, Collection, CollectionItem, OpenItem } from "@shared/core/types";
import { chargeService } from "@shared/modules/ledger/services/ChargeService";
import type { BillRecipient } from "@/modules/invoicing/useSendBillReceipt";
import { BillDialog } from "./BillDialog";

interface OpenedBill {
  charge: Charge;
  label: string;
  customerName: string | null;
  recipient: BillRecipient | null;
}

type Shown = Omit<OpenedBill, "charge">;

export interface BillDoors {
  onCollect?: (charge: Charge, balance: number) => void;
  onWriteOff?: (charge: Charge, balance: number) => void;
  onRevertWriteOff?: (charge: Charge, balance: number) => Promise<void>;
}

interface BillDialogOptions {
  onChanged?: (voided: Collection, replacement?: Collection) => void;
  doors?: BillDoors;
}

export interface BillDialogDoor {
  openItem: (
    item: CollectionItem,
    label: string,
    customerName: string | null,
    recipient?: BillRecipient | null,
  ) => Promise<void>;
  openOwed: (item: OpenItem, recipient?: BillRecipient | null) => Promise<void>;
  openCharge: (charge: Charge, label: string, customerName: string | null, recipient?: BillRecipient | null) => void;
  loadingItemId: string | null;
  error: string | null;
  clearError: () => void;
  dialog: ReactNode;
}

// A sale shows as a plain bill for now; collect and write-off close it first.
export function useBillDialog({ onChanged, doors = {} }: BillDialogOptions = {}): BillDialogDoor {
  const [bill, setBill] = useState<OpenedBill | null>(null);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);
  const close = () => setBill(null);

  const show = useCallback(
    async (key: string, chargeId: string, charge: Charge | null | undefined, shown: Shown) => {
      setError(null);
      if (charge) {
        setBill({ charge, ...shown });
        return;
      }
      setLoadingItemId(key);
      try {
        const read = await chargeService.getById(chargeId);
        if (read) setBill({ charge: read, ...shown });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingItemId(null);
      }
    },
    [],
  );

  const openItem = useCallback<BillDialogDoor["openItem"]>(
    (item, label, customerName, recipient = null) =>
      show(item.id, item.chargeId, item.charge, { label, customerName, recipient }),
    [show],
  );

  const openOwed = useCallback<BillDialogDoor["openOwed"]>(
    async (item, recipient = null) => {
      if (!item.chargeId) return;
      await show(item.chargeId, item.chargeId, item.charge, {
        label: item.label,
        customerName: item.customerName,
        recipient,
      });
    },
    [show],
  );

  const openCharge = useCallback<BillDialogDoor["openCharge"]>((charge, label, customerName, recipient = null) => {
    setError(null);
    setBill({ charge, label, customerName, recipient });
  }, []);

  const { onCollect, onWriteOff, onRevertWriteOff } = doors;

  return {
    openItem,
    openOwed,
    openCharge,
    loadingItemId,
    error,
    clearError,
    dialog: bill ? (
      <BillDialog
        charge={bill.charge}
        label={bill.label}
        customerName={bill.customerName}
        recipient={bill.recipient}
        onClose={close}
        onChanged={onChanged}
        onCollect={
          onCollect
            ? (charge, balance) => {
                close();
                onCollect(charge, balance);
              }
            : undefined
        }
        onWriteOff={
          onWriteOff
            ? (charge, balance) => {
                close();
                onWriteOff(charge, balance);
              }
            : undefined
        }
        onRevertWriteOff={onRevertWriteOff}
      />
    ) : null,
  };
}
