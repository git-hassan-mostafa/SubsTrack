import type { Sale } from "@shared/core/types";
import { useSalesInvoiceSend } from "@shared/modules/invoicing/hooks/useSalesInvoiceSend";
import { openWhatsAppAfterSave } from "@/shared/lib/openWhatsAppAfterSave";

export function useSendSalesInvoice(): (sales: Sale[]) => Promise<boolean> {
  return useSalesInvoiceSend(openWhatsAppAfterSave);
}
