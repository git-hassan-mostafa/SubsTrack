import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { Charge, Collection, Sale } from "@shared/core/types";
import { confirm } from "@shared/shared/lib/confirm";
import { useInvoiceContext } from "@shared/modules/invoicing/hooks/useInvoiceContext";
import {
  buildBillInvoiceText,
  buildCollectionInvoiceText,
  buildSalesInvoiceText,
} from "@shared/modules/invoicing/utils/invoiceText";
import {
  INVOICE_UNREACHABLE_KEYS,
  resolveInvoiceRecipient,
  type InvoiceRecipientRow,
} from "@shared/modules/invoicing/utils/invoiceRecipient";
import { useWhatsApp } from "./useWhatsApp";

// The one place that turns a saved record into a WhatsApp message.
export function useSendInvoice() {
  const { t } = useTranslation();
  const { canSend, openChat } = useWhatsApp();
  const ctx = useInvoiceContext();

  const resolveRecipient = useCallback(
    async (rows: InvoiceRecipientRow[]) => {
      const result = resolveInvoiceRecipient(rows);
      if (result.ok) return result;
      if (result.reason !== "empty") {
        await confirm({
          title: t("common.not_available"),
          message: t(INVOICE_UNREACHABLE_KEYS[result.reason]),
          confirmLabel: t("common.close"),
          hideCancel: true,
        });
      }
      return null;
    },
    [t],
  );

  const sendCollectionInvoice = useCallback(
    (a: {
      phone: string | null | undefined;
      customerName: string;
      collection: Collection;
    }) =>
      openChat(
        a.phone,
        buildCollectionInvoiceText(ctx, a.customerName, a.collection),
      ),
    [ctx, openChat],
  );

  const sendBillInvoice = useCallback(
    (a: {
      phone: string | null | undefined;
      customerName: string;
      charge: Charge;
      payments: Collection[];
    }) =>
      openChat(
        a.phone,
        buildBillInvoiceText(ctx, a.customerName, a.charge, a.payments),
      ),
    [ctx, openChat],
  );

  const sendSalesInvoice = useCallback(
    (a: {
      phone: string | null | undefined;
      customerName: string | null;
      sales: Sale[];
    }) =>
      openChat(a.phone, buildSalesInvoiceText(ctx, a.sales, a.customerName)),
    [ctx, openChat],
  );

  const sendSaleInvoice = useCallback(
    (a: {
      phone: string | null | undefined;
      customerName: string | null;
      sale: Sale;
    }) => sendSalesInvoice({ ...a, sales: [a.sale] }),
    [sendSalesInvoice],
  );

  return {
    canSend,
    resolveRecipient,
    sendBillInvoice,
    sendCollectionInvoice,
    sendSaleInvoice,
    sendSalesInvoice,
  };
}
