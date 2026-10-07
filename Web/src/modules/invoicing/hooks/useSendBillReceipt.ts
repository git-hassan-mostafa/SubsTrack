import { useCallback } from "react";
import type { Charge, Collection } from "@shared/core/types";
import { useInvoiceContext } from "@shared/modules/invoicing/hooks/useInvoiceContext";
import type { ContactRecipient } from "@shared/modules/invoicing/utils/invoiceRecipient";
import { buildBillInvoiceText } from "@shared/modules/invoicing/utils/invoiceText";
import { openWhatsAppAfterSave } from "@/shared/lib/openWhatsAppAfterSave";

// One bill with every payment on it, as a WhatsApp message to the customer.
export function useSendBillReceipt(): (
  recipient: ContactRecipient,
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
