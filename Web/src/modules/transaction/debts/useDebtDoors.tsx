import { useCallback, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Charge, OpenItem } from "@shared/core/types";
import { useWriteOffActions, writeOffTargetOf } from "@shared/modules/ledger/hooks/useWriteOffActions";
import { openItemFromCharge } from "@shared/modules/ledger/utils/openItems";
import { useRemoveCustomDebt } from "@shared/modules/transaction/debts/hooks/useRemoveCustomDebt";
import type { CustomDebtCustomer } from "@shared/modules/transaction/debts/utils/customDebtForm";
import { debtItemActions, type DebtItemActionKey } from "@shared/modules/transaction/debts/utils/debtItemView";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { toTableActions, type TableAction } from "@/shared/table/tableAction";
import type { ContactRecipient } from "@shared/modules/invoicing/utils/invoiceRecipient";
import { useBillDialog } from "@/modules/ledger/bill/useBillDialog";
import { useCollectDialog } from "@/modules/ledger/collect/useCollectDialog";
import { useSaleDoors } from "@/modules/transaction/sales/useSaleDoors";
import { CustomDebtFormDialog } from "./CustomDebtFormDialog";
import { DEBT_ACTION_ICONS } from "./debtActionIcons";

interface FormTarget {
  item: OpenItem | null;
  customer: CustomDebtCustomer | null;
}

interface DebtDoorsOptions {
  recipientOf?: (item: OpenItem) => ContactRecipient | null;
}

export interface DebtDoors {
  rowActions: (item: OpenItem) => TableAction[];
  openBill: (item: OpenItem) => void;
  loadingItemId: string | null;
  collectAll: (customerId: string, customerName: string, items: OpenItem[]) => void;
  writeOffAll: (customerName: string, items: OpenItem[]) => void;
  addCustomDebt: (customer?: CustomDebtCustomer | null) => void;
  banners: ReactNode;
  dialogs: ReactNode;
}

// Every web door onto a debt row; each write announces owedVersion, so no reload here.
export function useDebtDoors({ recipientOf }: DebtDoorsOptions = {}): DebtDoors {
  const { t } = useTranslation();
  const writeOffActions = useWriteOffActions();
  const { writeOff, revert, writeOffAll } = writeOffActions;
  const removeCustomDebt = useRemoveCustomDebt();
  const collect = useCollectDialog();
  const { open: collectAll, openOne } = collect;
  const sale = useSaleDoors();
  const [opened, setOpened] = useState<OpenItem | null>(null);
  const [form, setForm] = useState<FormTarget | null>(null);
  const openedName = opened?.customerName ?? "";

  const bill = useBillDialog({
    onOpenSale: sale.openSale,
    doors: {
      onCollect: (charge: Charge, balance: number) =>
        collect.openOne(
          openedName,
          openItemFromCharge(charge, charge.amount - balance, opened?.label ?? "", openedName),
        ),
      onWriteOff: (charge, balance) =>
        void writeOffActions.writeOff(writeOffTargetOf(charge, balance, openedName)),
      onRevertWriteOff: (charge, balance) =>
        writeOffActions.revert(writeOffTargetOf(charge, balance, openedName)),
    },
  });

  const rowActions = useCallback(
    (item: OpenItem): TableAction[] => {
      const run: Record<DebtItemActionKey, () => void> = {
        collect: () => openOne(item.customerName, item),
        revert_write_off: () => void revert(item),
        edit: () => setForm({ item, customer: null }),
        write_off: () => void writeOff(item),
        remove: () => void removeCustomDebt(item),
      };
      return toTableActions(debtItemActions(item), t, { icons: DEBT_ACTION_ICONS, run });
    },
    [t, openOne, revert, writeOff, removeCustomDebt],
  );

  const { openOwed } = bill;
  const openBill = useCallback(
    (item: OpenItem) => {
      setOpened(item);
      void openOwed(item, recipientOf?.(item) ?? null);
    },
    [openOwed, recipientOf],
  );

  return {
    rowActions,
    openBill,
    loadingItemId: bill.loadingItemId,
    collectAll,
    writeOffAll: (customerName, items) => void writeOffAll(customerName, items),
    addCustomDebt: (customer = null) => setForm({ item: null, customer }),
    banners: (
      <>
        <ErrorBanner message={bill.error} onDismiss={bill.clearError} />
        <ErrorBanner message={sale.error} onDismiss={sale.clearError} />
        <ErrorBanner message={sale.notice} onDismiss={sale.clearNotice} severity="info" />
      </>
    ),
    dialogs: (
      <>
        {collect.dialog}
        {bill.dialog}
        {sale.dialogs}
        {form ? (
          <CustomDebtFormDialog
            item={form.item}
            initialCustomer={form.customer}
            onClose={() => setForm(null)}
          />
        ) : null}
      </>
    ),
  };
}
