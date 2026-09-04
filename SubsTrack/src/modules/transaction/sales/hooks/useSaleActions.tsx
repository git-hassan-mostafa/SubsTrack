import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Collection, Sale } from "@/src/core/types";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { openItemFromCharge, useCollectSheet } from "@/src/modules/ledger";
import { useRecordHistoryAction } from "@/src/modules/admin/audit";
import { saleTitle } from "@/src/core/utils/receiptId";
import { useSendInvoice, WhatsAppComboIcon } from "@/src/modules/invoicing";
import { SaleBulkVoidSheet } from "../components/SaleBulkVoidSheet";
import type { SaleVoidResult } from "../utils/types";

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

/**
 * Everything a single sale can do, defined once for all three sales surfaces
 * (the Transactions tab, the customer panel, the customer's full list): open the
 * receipt, correct it, collect what is still owed on it, re-send it on WhatsApp,
 * read its history, void it.
 *
 * The screens keep the receipt sheet and the sale form — they own the refresh
 * callbacks — so this only holds the menu, the void dialog and the history sheet.
 * One ActionMenu per SCREEN, not per row: these lists are virtualized and
 * paginated, so a per-card menu would mount one bottom sheet per visible row.
 */
export function useSaleActions({
  onView,
  onEdit,
  onVoided,
  onCollected,
}: Options): SaleActions {
  const { t } = useTranslation();
  const { canSend, sendSaleInvoice } = useSendInvoice();
  const history = useRecordHistoryAction("sales");
  const collectSheet = useCollectSheet({ onCollected });
  const [menuSale, setMenuSale] = useState<Sale | null>(null);
  const [voidTarget, setVoidTarget] = useState<{
    saleIds: string[];
    chargeIds: string[];
  } | null>(null);

  // Collect what is still owed on a pay-later or partly-paid sale. It goes
  // through the SAME sheet as any other bill — one door for money in, so the
  // custody, audit and currency rules are written in exactly one place.
  // Synchronous on purpose: the bill rode in on the sale, so the sheet opens on
  // the tap instead of after a query — the debts card has always behaved that way.
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
    const voided = sale.voidedAt !== null;
    const actions: ActionMenuItem[] = [
      {
        key: "view",
        label: t("sales.view_receipt"),
        icon: "receipt-outline",
        onPress: () => onView(sale),
      },
    ];

    if (!voided) {
      actions.push({
        key: "edit",
        label: t("sales.edit_sale"),
        icon: "create-outline",
        onPress: () => onEdit(sale),
      });

      const owed = sale.totalAmount - sale.amountPaid;
      if (owed > 1e-9 && sale.customerId) {
        actions.push({
          key: "collect",
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

    actions.push(history.action(sale.id, saleTitle(sale.id, sale.itemsSummary)));

    if (!voided) {
      actions.push({
        key: "void",
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
        chargeIds: sales.map((s) => s.chargeId).filter((id): id is string => !!id),
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

        {history.sheet}
        {collectSheet.sheet}
      </>
    ),
  };
}
