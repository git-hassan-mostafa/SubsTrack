import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Charge, OpenItem } from "@shared/core/types";
import { useWriteOffActions, writeOffTargetOf } from "@shared/modules/ledger/hooks/useWriteOffActions";
import { openItemFromCharge } from "@shared/modules/ledger/utils/openItems";
import { useRemoveCustomDebt } from "@shared/modules/transaction/debts/hooks/useRemoveCustomDebt";
import type { CustomDebtCustomer } from "@shared/modules/transaction/debts/utils/customDebtForm";
import { debtItemActions, type DebtItemActionKey } from "@shared/modules/transaction/debts/utils/debtItemView";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import type { TableAction } from "@/shared/table/tableAction";
import type { BillRecipient } from "@/modules/invoicing/useSendBillReceipt";
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
  recipientOf?: (item: OpenItem) => BillRecipient | null;
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
  const removeCustomDebt = useRemoveCustomDebt();
  const collect = useCollectDialog();
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

  const run: Record<DebtItemActionKey, (item: OpenItem) => void> = {
    collect: (item) => collect.openOne(item.customerName, item),
    revert_write_off: (item) => void writeOffActions.revert(item),
    edit: (item) => setForm({ item, customer: null }),
    write_off: (item) => void writeOffActions.writeOff(item),
    remove: (item) => void removeCustomDebt(item),
  };

  const rowActions = (item: OpenItem): TableAction[] =>
    debtItemActions(item).map((entry) => ({
      key: entry.key,
      group: entry.group,
      label: t(entry.labelKey),
      caption: entry.captionKey ? t(entry.captionKey) : undefined,
      icon: DEBT_ACTION_ICONS[entry.key],
      destructive: entry.destructive,
      onClick: () => run[entry.key](item),
    }));

  const openBill = (item: OpenItem) => {
    setOpened(item);
    void bill.openOwed(item, recipientOf?.(item) ?? null);
  };

  return {
    rowActions,
    openBill,
    loadingItemId: bill.loadingItemId,
    collectAll: collect.open,
    writeOffAll: (customerName, items) => void writeOffActions.writeOffAll(customerName, items),
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
