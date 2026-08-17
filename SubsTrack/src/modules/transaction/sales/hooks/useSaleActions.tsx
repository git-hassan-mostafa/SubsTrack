import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Sale } from "@/src/core/types";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { useRecordHistoryAction } from "@/src/modules/admin/audit";
import { useSendInvoice, WhatsAppComboIcon } from "@/src/modules/invoicing";
import { SaleBulkVoidSheet } from "../components/SaleBulkVoidSheet";

interface Options {
  /** Opens the receipt sheet. */
  onView: (sale: Sale) => void;
  /** Opens the sale form on this sale. */
  onEdit: (sale: Sale) => void;
  /** After a void — the screen refreshes its own list and reports failures. */
  onVoided?: (result: { ok: number; failed: number }) => void;
}

export interface SaleActions {
  /** Opens one sale's 3-dot menu. */
  openMenu: (sale: Sale) => void;
  /** The shared-reason void dialog, for one sale or a whole selection. */
  requestVoid: (sales: Sale[]) => void;
  /** Render once per screen — the menu, the void dialog and the history sheet. */
  sheets: ReactNode;
}

/**
 * Everything a single sale can do, defined once for all three sales surfaces
 * (the Transactions tab, the customer panel, the customer's full list): open the
 * receipt, correct it, re-send it on WhatsApp, read its history, void it.
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
}: Options): SaleActions {
  const { t } = useTranslation();
  const { canSend, sendSaleInvoice } = useSendInvoice();
  const history = useRecordHistoryAction("sales");
  const [menuSale, setMenuSale] = useState<Sale | null>(null);
  const [voidIds, setVoidIds] = useState<string[] | null>(null);

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

    // A voided sale is a closed record — void is final. It can still be read,
    // never corrected, re-sent as a receipt, or voided again.
    if (!voided) {
      actions.push({
        key: "edit",
        label: t("sales.edit_sale"),
        icon: "create-outline",
        onPress: () => onEdit(sale),
      });

      const phone = sale.customer?.phoneNumber ?? null;
      const sendable = canSend(phone);
      actions.push({
        key: "invoice",
        label: t("invoice.send_invoice_whatsapp"),
        renderIcon: (size) => (
          <WhatsAppComboIcon variant="report" size={size} />
        ),
        disabled: !sendable,
        // A walk-in has nobody to send to; a customer may just be missing a phone.
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

    actions.push(history.action(sale.id, sale.itemsSummary));

    if (!voided) {
      actions.push({
        key: "void",
        label: t("sales.void_sale"),
        icon: "close-circle-outline",
        destructive: true,
        onPress: () => setVoidIds([sale.id]),
      });
    }
    return actions;
  }

  return {
    openMenu: setMenuSale,
    requestVoid: (sales) => {
      if (sales.length > 0) setVoidIds(sales.map((s) => s.id));
    },
    sheets: (
      <>
        <ActionMenu
          visible={menuSale !== null}
          title={menuSale?.itemsSummary}
          actions={buildActions(menuSale)}
          onDismiss={() => setMenuSale(null)}
        />

        {voidIds ? (
          <SaleBulkVoidSheet
            saleIds={voidIds}
            onVoided={(result) => {
              setVoidIds(null);
              onVoided?.(result);
            }}
            onDismiss={() => setVoidIds(null)}
          />
        ) : null}

        {history.sheet}
      </>
    ),
  };
}
