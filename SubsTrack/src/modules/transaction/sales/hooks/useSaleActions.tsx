import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Sale } from "@/src/core/types";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { confirm } from "@/src/shared/lib/confirm";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useSaleSlice } from "@/src/state/hooks/useSaleSlice";
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
  /**
   * After a "complete" — the amount collected moved, and the Sales tab's month
   * section totals are a separate query, so the screen refetches (same reason
   * the sale form's `onUpdated` does).
   */
  onCompleted?: () => void;
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
 * receipt, correct it, mark it fully paid, re-send it on WhatsApp, read its
 * history, void it.
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
  onCompleted,
}: Options): SaleActions {
  const { t } = useTranslation();
  const { canSend, sendSaleInvoice } = useSendInvoice();
  const history = useRecordHistoryAction("sales");
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const completeSale = useSaleSlice((s) => s.completeSale);
  const [menuSale, setMenuSale] = useState<Sale | null>(null);
  const [voidIds, setVoidIds] = useState<string[] | null>(null);

  // "Complete": the sale was paid in full, the amount collected was just written
  // down short. Raises amount_paid to the total — a correction, so no debt
  // payment is recorded and the sale's debt row simply disappears.
  async function handleComplete(sale: Sale) {
    const remaining = sale.totalAmount - sale.amountPaid;
    const source = findCurrency(currencies, sale.currencyId);
    const target = findCurrency(currencies, displayCurrencyId);
    const ok = await confirm({
      title: t("common.complete_title"),
      message: t("common.complete_message", {
        amount: formatMoney(remaining, source, target),
      }),
      confirmLabel: t("common.complete"),
    });
    if (!ok) return;
    const updated = await completeSale(sale.id);
    if (updated) onCompleted?.();
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

    // A voided sale is a closed record — void is final. It can still be read,
    // never corrected, re-sent as a receipt, or voided again.
    if (!voided) {
      actions.push({
        key: "edit",
        label: t("sales.edit_sale"),
        icon: "create-outline",
        onPress: () => onEdit(sale),
      });

      // Only a sale that still owes something has anything to complete.
      if (sale.amountPaid < sale.totalAmount) {
        actions.push({
          key: "complete",
          label: t("common.complete"),
          icon: "checkmark-done-outline",
          caption: t("common.complete_caption"),
          onPress: () => void handleComplete(sale),
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
