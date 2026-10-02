import { useCallback, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Customer, Sale } from "@shared/core/types";
import { formatMoney, snapshotCurrency } from "@shared/core/utils/currency";
import { saleTitle } from "@shared/core/utils/receiptId";
import { whatsAppChatUrl } from "@shared/core/utils/whatsappLink";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { openItemFromCharge } from "@shared/modules/ledger/utils/openItems";
import saleService from "@shared/modules/transaction/sales/services/SaleService";
import {
  saleFacts,
  saleMenuItems,
  saleVoidTarget,
  type SaleActionKey,
  type SaleVoidTarget,
} from "@shared/modules/transaction/sales/utils/saleView";
import type { SaleVoidResult } from "@shared/modules/transaction/sales/utils/types";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import type { TableAction } from "@/shared/table/tableAction";
import { BillHistoryDialog } from "@/modules/admin/audit/RecordHistoryDialog";
import { useSendSalesInvoice } from "@/modules/invoicing/useSendSalesInvoice";
import { useCollectDialog } from "@/modules/ledger/collect/useCollectDialog";
import { reloadProductsTableIfLoaded } from "@/state/productsTable";
import { SALE_ACTION_ICONS } from "./saleActionIcons";
import { SaleFormDialog } from "./SaleFormDialog";
import { SaleReceiptDialog } from "./SaleReceiptDialog";
import { VoidSalesDialog } from "./VoidSalesDialog";

interface SaleDoorOptions {
  onChanged?: () => void;
  onSaved?: (sale: Sale, created: boolean) => void;
}

type SaleFormTarget = { sale: Sale | null; customer: Customer | null };

export interface SaleDoors {
  openReceipt: (sale: Sale) => void;
  openSale: (saleId: string) => Promise<void>;
  recordSale: (customer?: Customer | null) => void;
  rowActions: (sale: Sale) => TableAction[];
  bulkActions: (selected: Sale[]) => TableAction[];
  error: string | null;
  clearError: () => void;
  notice: string | null;
  clearNotice: () => void;
  dialogs: ReactNode;
}

const canSend = (phone: string | null) => whatsAppChatUrl(phone) !== null;

// Every web door onto a sale; `onChanged` re-reads after any write.
export function useSaleDoors({ onChanged, onSaved }: SaleDoorOptions = {}): SaleDoors {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const sendInvoice = useSendSalesInvoice();
  const collect = useCollectDialog({ onCollected: () => onChanged?.() });
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [voidTarget, setVoidTarget] = useState<SaleVoidTarget | null>(null);
  const [historySale, setHistorySale] = useState<Sale | null>(null);
  const [formTarget, setFormTarget] = useState<SaleFormTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { openOne } = collect;

  const collectRest = useCallback(
    (sale: Sale, owed: number) => {
      if (!sale.charge) return;
      const name = sale.customer?.name ?? "";
      openOne(name, openItemFromCharge(sale.charge, sale.charge.amount - owed, sale.itemsSummary, name));
    },
    [openOne],
  );

  const send = useCallback((sale: Sale) => void sendInvoice([sale]), [sendInvoice]);

  const edit = useCallback((sale: Sale) => {
    setReceipt(null);
    setFormTarget({ sale, customer: null });
  }, []);

  const openSale = useCallback(async (saleId: string) => {
    setError(null);
    try {
      const sale = await saleService.getSaleById(saleId);
      if (sale) setReceipt(sale);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const voided = (result: SaleVoidResult) => {
    setVoidTarget(null);
    setReceipt(null);
    reloadProductsTableIfLoaded();
    if (result.failed > 0) setNotice(t("common.bulk_void_summary", { ok: result.ok, failed: result.failed }));
    onChanged?.();
  };

  const rowActions = useCallback(
    (sale: Sale): TableAction[] => {
      const owed = saleFacts(sale).owed;
      const currency = snapshotCurrency(sale, currencies);
      const run: Partial<Record<SaleActionKey, () => void>> = {
        view: () => setReceipt(sale),
        edit: () => edit(sale),
        collect: () => collectRest(sale, owed),
        invoice: () => send(sale),
        history: () => setHistorySale(sale),
        void: () => setVoidTarget(saleVoidTarget([sale])),
      };
      return saleMenuItems(sale, { isAdmin, canSend }).flatMap((item) => {
        const handler = run[item.key];
        if (!handler) return [];
        return [
          {
            key: item.key,
            group: item.group,
            label: t(item.labelKey, { amount: formatMoney(owed, currency, currency) }),
            caption: item.captionKey ? t(item.captionKey) : undefined,
            icon: SALE_ACTION_ICONS[item.key],
            disabled: item.disabled,
            destructive: item.destructive,
            onClick: handler,
          },
        ];
      });
    },
    [collectRest, currencies, edit, isAdmin, send, t],
  );

  const bulkActions = useCallback(
    (selected: Sale[]): TableAction[] => {
      const target = saleVoidTarget(selected);
      if (target.saleIds.length === 0) return [];
      return [
        {
          key: "invoice",
          group: "send",
          label: t("invoice.send_invoice_whatsapp"),
          icon: SALE_ACTION_ICONS.invoice,
          onClick: () => void sendInvoice(selected),
        },
        {
          key: "void",
          group: "danger",
          label: t("sales.void_sale"),
          icon: SALE_ACTION_ICONS.void,
          destructive: true,
          onClick: () => setVoidTarget(target),
        },
      ];
    },
    [sendInvoice, t],
  );

  return {
    openReceipt: setReceipt,
    openSale,
    recordSale: (customer = null) => setFormTarget({ sale: null, customer }),
    rowActions,
    bulkActions,
    error,
    clearError: () => setError(null),
    notice,
    clearNotice: () => setNotice(null),
    dialogs: (
      <>
        {receipt ? (
          <SaleReceiptDialog
            sale={receipt}
            onClose={() => setReceipt(null)}
            onSend={send}
            onEdit={edit}
            onCollect={(sale, owed) => {
              setReceipt(null);
              collectRest(sale, owed);
            }}
            onVoid={(sale) => setVoidTarget(saleVoidTarget([sale]))}
            onChanged={() => onChanged?.()}
          />
        ) : null}
        {formTarget ? (
          <SaleFormDialog
            sale={formTarget.sale}
            initialCustomer={formTarget.customer}
            onClose={() => setFormTarget(null)}
            onSaved={(saved, created) => {
              setFormTarget(null);
              onSaved?.(saved, created);
            }}
          />
        ) : null}
        {voidTarget ? (
          <VoidSalesDialog target={voidTarget} onDone={voided} onClose={() => setVoidTarget(null)} />
        ) : null}
        {historySale ? (
          <BillHistoryDialog
            chargeId={historySale.chargeId}
            targets={[{ table: "sales", recordId: historySale.id }]}
            name={saleTitle(historySale.id, historySale.itemsSummary)}
            onClose={() => setHistorySale(null)}
          />
        ) : null}
        {collect.dialog}
      </>
    ),
  };
}
