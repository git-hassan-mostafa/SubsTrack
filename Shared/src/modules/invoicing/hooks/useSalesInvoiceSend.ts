import { useCallback } from "react";
import type { Sale } from "@shared/core/types";
import { confirm } from "@shared/shared/lib/confirm";
import { useInvoiceContext } from "@shared/modules/invoicing/hooks/useInvoiceContext";
import {
  INVOICE_UNREACHABLE_KEYS,
  resolveInvoiceRecipient,
  saleRecipientRows,
} from "@shared/modules/invoicing/utils/invoiceRecipient";
import { buildSalesInvoiceText } from "@shared/modules/invoicing/utils/invoiceText";

export type OpenWhatsAppChat = (phone: string, text: string) => Promise<unknown>;

// ONE message for every live sale picked; they must all belong to one customer.
export function useSalesInvoiceSend(
  openChat: OpenWhatsAppChat,
): (sales: Sale[]) => Promise<boolean> {
  const ctx = useInvoiceContext();
  return useCallback(
    async (sales) => {
      const live = sales.filter((sale) => sale.voidedAt === null);
      const to = resolveInvoiceRecipient(saleRecipientRows(live));
      if (to.ok) {
        await openChat(to.phone, buildSalesInvoiceText(ctx, live, to.name));
        return true;
      }
      if (to.reason !== "empty") {
        await confirm({
          title: ctx.t("common.not_available"),
          message: ctx.t(INVOICE_UNREACHABLE_KEYS[to.reason]),
          confirmLabel: ctx.t("common.close"),
          hideCancel: true,
        });
      }
      return false;
    },
    [ctx, openChat],
  );
}
