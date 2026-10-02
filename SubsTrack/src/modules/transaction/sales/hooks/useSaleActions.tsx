import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Collection, Sale } from "@shared/core/types";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { BillHistorySheet, useCollectSheet } from "@/src/modules/ledger";
import { openItemFromCharge } from "@shared/modules/ledger/utils/openItems";
import { saleTitle } from "@shared/core/utils/receiptId";
import {
  saleMenuItems,
  saleVoidTarget,
  type SaleActionKey,
  type SaleVoidTarget,
} from "@shared/modules/transaction/sales/utils/saleView";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useSendInvoice, WhatsAppComboIcon } from "@/src/modules/invoicing";
import { SaleBulkVoidSheet } from "../components/SaleBulkVoidSheet";
import type { SaleVoidResult } from "@shared/modules/transaction/sales/utils/types";

interface Options {
  onView: (sale: Sale) => void;
  onEdit: (sale: Sale) => void;
  onVoided?: (result: SaleVoidResult) => void;
  onCollected?: (collection: Collection) => void;
}

export interface SaleActions {
  openMenu: (sale: Sale) => void;
  requestVoid: (sales: Sale[]) => void;
  sheets: ReactNode;
}

const SALE_ACTION_ICONS: Record<
  Exclude<SaleActionKey, "invoice">,
  NonNullable<ActionMenuItem["icon"]>
> = {
  view: "receipt-outline",
  edit: "create-outline",
  collect: "cash-outline",
  history: "time-outline",
  void: "close-circle-outline",
};

// One ActionMenu per SCREEN, not per row: these lists are virtualized.
export function useSaleActions({
  onView,
  onEdit,
  onVoided,
  onCollected,
}: Options): SaleActions {
  const { t } = useTranslation();
  const { canSend, sendSaleInvoice } = useSendInvoice();
  const { isAdmin } = useAuth();
  const collectSheet = useCollectSheet({ onCollected });
  const [menuSale, setMenuSale] = useState<Sale | null>(null);
  const [historySale, setHistorySale] = useState<Sale | null>(null);
  const [voidTarget, setVoidTarget] = useState<SaleVoidTarget | null>(null);

  // Synchronous: the bill rode in on the sale, so the sheet opens on the tap.
  function handleCollect(sale: Sale) {
    if (!sale.charge) return;
    collectSheet.openOne(
      sale.customer?.name ?? "",
      openItemFromCharge(
        sale.charge,
        sale.amountPaid,
        sale.itemsSummary,
        sale.customer?.name ?? "",
      ),
    );
  }

  function buildActions(sale: Sale | null): ActionMenuItem[] {
    if (!sale) return [];
    const run: Record<SaleActionKey, () => void> = {
      view: () => onView(sale),
      edit: () => onEdit(sale),
      collect: () => handleCollect(sale),
      invoice: () =>
        void sendSaleInvoice({
          phone: sale.customer?.phoneNumber ?? null,
          customerName: sale.customer?.name ?? null,
          sale,
        }),
      history: () => setHistorySale(sale),
      void: () => setVoidTarget(saleVoidTarget([sale])),
    };
    return saleMenuItems(sale, { isAdmin, canSend }).map((item) => ({
      key: item.key,
      group: item.group,
      label: t(item.labelKey, { amount: "" }),
      caption: item.captionKey ? t(item.captionKey) : undefined,
      disabled: item.disabled,
      destructive: item.destructive,
      ...(item.key === "invoice"
        ? {
            renderIcon: (size: number) => (
              <WhatsAppComboIcon variant="report" size={size} />
            ),
          }
        : { icon: SALE_ACTION_ICONS[item.key] }),
      onPress: run[item.key],
    }));
  }

  return {
    openMenu: setMenuSale,
    requestVoid: (sales) => {
      const target = saleVoidTarget(sales);
      if (target.saleIds.length > 0) setVoidTarget(target);
    },
    sheets: (
      <>
        <ActionMenu
          visible={menuSale !== null}
          title={menuSale?.itemsSummary}
          actions={buildActions(menuSale)}
          onDismiss={() => setMenuSale(null)}
        />

        {voidTarget ? (
          <SaleBulkVoidSheet
            saleIds={voidTarget.saleIds}
            chargeIds={voidTarget.chargeIds}
            onVoided={(result) => {
              setVoidTarget(null);
              onVoided?.(result);
            }}
            onDismiss={() => setVoidTarget(null)}
          />
        ) : null}

        {historySale ? (
          <BillHistorySheet
            targets={[{ table: "sales", recordId: historySale.id }]}
            chargeId={historySale.chargeId}
            subtitle={saleTitle(historySale.id, historySale.itemsSummary)}
            onDismiss={() => setHistorySale(null)}
          />
        ) : null}
        {collectSheet.sheet}
      </>
    ),
  };
}
