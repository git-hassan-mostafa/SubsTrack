import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DebtItem, MonthEntry, Sale } from "@/src/core/types";
import { confirm } from "@/src/shared/lib/confirm";
import {
  paymentToMonthEntry,
  PaymentDetailSheet,
} from "@/src/modules/customer/customer-payments";
import { saleService, SaleDetailSheet } from "@/src/modules/transaction/sales";

// The record behind a derived debt row, ready to render.
type Source =
  | { kind: "payment"; entry: MonthEntry; item: DebtItem }
  | { kind: "sale"; sale: Sale };

/**
 * Opens the record a DERIVED debt row came from: the month receipt for a partial
 * payment, the sale receipt for a partial sale.
 *
 * The two halves differ because their queries do. `partialPayments` selects the
 * payment in full, so a `months` row carries it (`DebtItem.payment`) and its
 * receipt opens with **no** fetch — same as the payments history, which holds
 * `PaymentListItem` for the same reason. `partialSales` is deliberately lean
 * (`'*, customers(*)'`, no `sale_items`), so a `sales` row holds only an id and
 * its lines must be loaded; that row alone shows a spinner.
 *
 * Read-only on purpose: voiding or editing here would contradict the row's own
 * Pay / Complete actions, which is what the 3-dot menu is for. A custom debt has
 * no record behind it and is ignored.
 */
export function useDebtSourceSheet() {
  const { t } = useTranslation();
  const [source, setSource] = useState<Source | null>(null);
  // Which row is being fetched — the card shows a spinner in place of its menu.
  // Only ever a sale row; a month row opens from data already in hand.
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const open = useCallback(
    async (item: DebtItem) => {
      if (item.sourceType === "custom_debt") return;

      if (item.sourceType === "payment") {
        if (!item.payment) return;
        setSource({
          kind: "payment",
          entry: paymentToMonthEntry(item.payment),
          item,
        });
        return;
      }

      setLoadingId(item.id);
      try {
        const sale = await saleService.getSaleById(item.id);
        if (!sale) {
          await confirm({
            title: t("common.not_available"),
            message: t("errors.sale_missing"),
            confirmLabel: t("common.close"),
            hideCancel: true,
          });
          return;
        }
        setSource({ kind: "sale", sale });
      } finally {
        setLoadingId(null);
      }
    },
    [t],
  );

  const sheet =
    source?.kind === "payment" ? (
      <PaymentDetailSheet
        entry={source.entry}
        customerName={source.item.customerName}
        planName={source.item.label}
        onDismiss={() => setSource(null)}
      />
    ) : source?.kind === "sale" ? (
      <SaleDetailSheet sale={source.sale} onDismiss={() => setSource(null)} />
    ) : null;

  return { open, sheet, loadingId };
}
