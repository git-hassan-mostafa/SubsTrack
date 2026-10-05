import { useCallback } from "react";
import type { Sale } from "@shared/core/types";
import { useSendInvoice } from "@/src/modules/invoicing";
import { saleRecipientRows } from "@shared/modules/invoicing/utils/invoiceRecipient";

// One receipt covers every selected sale, not one message per sale.
export function useSaleInvoiceSend() {
  const { sendSalesInvoice, resolveRecipient } = useSendInvoice();

  return useCallback(
    async (selected: Sale[]): Promise<boolean> => {
      const sales = selected.filter((s) => s.voidedAt === null);
      const to = await resolveRecipient(saleRecipientRows(sales));
      if (!to) return false;
      await sendSalesInvoice({ phone: to.phone, customerName: to.name, sales });
      return true;
    },
    [resolveRecipient, sendSalesInvoice],
  );
}
