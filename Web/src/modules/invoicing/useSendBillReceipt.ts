import { useCallback } from "react";
import type { Charge, Collection } from "@shared/core/types";
import { useInvoiceContext } from "@shared/modules/invoicing/hooks/useInvoiceContext";
import { buildBillInvoiceText } from "@shared/modules/invoicing/utils/invoiceText";
import { openWhatsAppAfterSave } from "@/shared/lib/openWhatsAppAfterSave";

export interface BillRecipient {
  name: string;
  phone: string | null;
}

// One bill with every payment on it, as a WhatsApp message to the customer.
export function useSendBillReceipt(): (
  recipient: BillRecipient,
  charge: Charge,
  payments: Collection[],
) => Promise<void> {
  const ctx = useInvoiceContext();
  return useCallback(
    (recipient, charge, payments) =>
      openWhatsAppAfterSave(recipient.phone, buildBillInvoiceText(ctx, recipient.name, charge, payments)),
    [ctx],
  );
}
