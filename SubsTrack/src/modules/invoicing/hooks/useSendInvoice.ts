import { useCallback } from "react";
import type { Charge, Collection } from "@shared/core/types";
import { useInvoiceContext } from "@shared/modules/invoicing/hooks/useInvoiceContext";
import { useSalesInvoiceSend } from "@shared/modules/invoicing/hooks/useSalesInvoiceSend";
import {
  buildBillInvoiceText,
  buildCollectionInvoiceText,
} from "@shared/modules/invoicing/utils/invoiceText";
import { useWhatsApp } from "./useWhatsApp";

// The one place that turns a saved record into a WhatsApp message.
export function useSendInvoice() {
  const { canSend, openChat } = useWhatsApp();
  const ctx = useInvoiceContext();
  const sendSales = useSalesInvoiceSend(openChat);

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

  return {
    canSend,
    sendBillInvoice,
    sendCollectionInvoice,
    sendSales,
  };
}
