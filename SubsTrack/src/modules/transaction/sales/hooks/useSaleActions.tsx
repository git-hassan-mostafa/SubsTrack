import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Collection, Sale } from "@/src/core/types";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { openItemFromCharge, useCollectSheet } from "@/src/modules/ledger";
import { useRecordHistoryAction } from "@/src/modules/admin/audit";
import { useSendInvoice, WhatsAppComboIcon } from "@/src/modules/invoicing";
import { SaleBulkVoidSheet } from "../components/SaleBulkVoidSheet";
import type { SaleVoidResult } from "../utils/types";

interface Options {
  /** Opens the receipt sheet. */
  onView: (sale: Sale) => void;
  /** Opens the sale form on this sale. */
  onEdit: (sale: Sale) => void;
  /**
   * After a void. Carries the rows that actually went, so a screen holding its
   * own list drops exactly those; the counts are for the "voided X · Y failed"
   * notice.
   */
  onVoided?: (result: SaleVoidResult) => void;
  /**
   * After money was collected against a sale. The global list is patched by the
   * ledger slice; a screen with its own list uses the hand-over to move the
   * sale's `amountPaid`.
   */
  onCollected?: (collection: Collection) => void;
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
  const [voidIds, setVoidIds] = useState<string[] | null>(null);

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

    // A voided sale is a closed record — void is final. It can still be read,
    // never corrected, re-sent as a receipt, or voided again.
    if (!voided) {
      actions.push({
        key: "edit",
        label: t("sales.edit_sale"),
        icon: "create-outline",
        onPress: () => onEdit(sale),
      });

      // Only a sale that still owes something can be collected on — and only
      // from a customer: a walk-in has nobody to chase.
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
        {collectSheet.sheet}
      </>
    ),
  };
}
