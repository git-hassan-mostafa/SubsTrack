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
import { saleFacts } from "@shared/modules/transaction/sales/utils/saleView";
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

// One ActionMenu per SCREEN, not per row: these lists are virtualized.
export function useSaleActions({
  onView,
  onEdit,
  onVoided,
  onCollected,
}: Options): SaleActions {
  const { t } = useTranslation();
  const { canSend, sendSaleInvoice } = useSendInvoice();
  const collectSheet = useCollectSheet({ onCollected });
  const [menuSale, setMenuSale] = useState<Sale | null>(null);
  const [historySale, setHistorySale] = useState<Sale | null>(null);
  const [voidTarget, setVoidTarget] = useState<{
    saleIds: string[];
    chargeIds: string[];
  } | null>(null);

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
    const { voided, canCollect } = saleFacts(sale);
    const actions: ActionMenuItem[] = [
      {
        key: "view",
        group: "open",
        label: t("sales.view_receipt"),
        icon: "receipt-outline",
        onPress: () => onView(sale),
      },
    ];

    if (!voided) {
      actions.push({
        key: "edit",
        group: "manage",
        label: t("sales.edit_sale"),
        icon: "create-outline",
        onPress: () => onEdit(sale),
      });

      if (canCollect) {
        actions.push({
          key: "collect",
          group: "money",
          label: t("ledger.collect_remaining", {
            amount: "",
          }),
          icon: "cash-outline",
          onPress: () => handleCollect(sale),
        });
      }

      const phone = sale.customer?.phoneNumber ?? null;
      const sendable = canSend(phone);
      actions.push({
        key: "invoice",
        group: "send",
        label: t("invoice.send_invoice_whatsapp"),
        renderIcon: (size) => (
          <WhatsAppComboIcon variant="report" size={size} />
        ),
        disabled: !sendable,
        caption: sendable
          ? undefined
          : sale.customer
            ? t("invoice.no_phone")
            : t("invoice.no_customer"),
        onPress: () =>
          void sendSaleInvoice({
            phone,
            customerName: sale.customer?.name ?? null,
            sale,
          }),
      });
    }

    actions.push({
      key: "history",
      group: "history",
      label: t("audit.history"),
      icon: "time-outline",
      onPress: () => setHistorySale(sale),
    });

    if (!voided) {
      actions.push({
        key: "void",
        group: "danger",
        label: t("sales.void_sale"),
        icon: "close-circle-outline",
        destructive: true,
        onPress: () =>
          setVoidTarget({
            saleIds: [sale.id],
            chargeIds: sale.chargeId ? [sale.chargeId] : [],
          }),
      });
    }
    return actions;
  }

  return {
    openMenu: setMenuSale,
    requestVoid: (sales) => {
      if (sales.length === 0) return;
      setVoidTarget({
        saleIds: sales.map((s) => s.id),
        chargeIds: sales
          .map((s) => s.chargeId)
          .filter((id): id is string => !!id),
      });
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
