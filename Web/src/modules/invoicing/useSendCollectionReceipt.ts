import { useCallback } from "react";
import type { Collection, Customer } from "@shared/core/types";
import { useInvoiceContext } from "@shared/modules/invoicing/hooks/useInvoiceContext";
import { buildCollectionInvoiceText } from "@shared/modules/invoicing/utils/invoiceText";
import { openWhatsAppAfterSave } from "@/shared/lib/openWhatsAppAfterSave";

// The receipt for ONE hand-over, sent right after it was saved (gotcha #68).
export function useSendCollectionReceipt(): (
  customer: Pick<Customer, "name" | "phoneNumber">,
  collection: Collection,
) => Promise<void> {
  const ctx = useInvoiceContext();
  return useCallback(
    (customer, collection) =>
      openWhatsAppAfterSave(
        customer.phoneNumber,
        buildCollectionInvoiceText(ctx, customer.name, collection),
      ),
    [ctx],
  );
}
