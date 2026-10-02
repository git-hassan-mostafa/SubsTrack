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
  onOpenSale?: (saleId: string) => Promise<void>;
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

// A sale bill opens its receipt through onOpenSale; collect and write-off close first.
export function useBillDialog({ onChanged, onOpenSale, doors = {} }: BillDialogOptions = {}): BillDialogDoor {
  const [bill, setBill] = useState<OpenedBill | null>(null);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);
  const close = () => setBill(null);

  const present = useCallback(
    async (charge: Charge, shown: Shown) => {
      if (charge.kind === "sale" && charge.saleId && onOpenSale) await onOpenSale(charge.saleId);
      else setBill({ charge, ...shown });
    },
    [onOpenSale],
  );

  const show = useCallback(
    async (key: string, chargeId: string, charge: Charge | null | undefined, shown: Shown) => {
      setError(null);
      setLoadingItemId(key);
      try {
        const read = charge ?? (await chargeService.getById(chargeId));
        if (read) await present(read, shown);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingItemId(null);
      }
    },
    [present],
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

  const openCharge = useCallback<BillDialogDoor["openCharge"]>(
    (charge, label, customerName, recipient = null) =>
      void show(charge.id, charge.id, charge, { label, customerName, recipient }),
    [show],
  );

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
