import { useTranslation } from "react-i18next";
import type { Sale } from "@shared/core/types";
import type { SelectionAction } from "@/src/shared/components/SelectionBar";
import { useSendInvoice, WhatsAppComboIcon } from "@/src/modules/invoicing";
import { saleRecipientRows } from "@shared/modules/invoicing/utils/invoiceRecipient";

// One receipt covers every selected sale, not one message per sale.
export function useSaleInvoiceAction(
  selected: Sale[],
  onSent: () => void,
): SelectionAction | null {
  const { t } = useTranslation();
  const { sendSalesInvoice, resolveRecipient } = useSendInvoice();

  const sales = selected.filter((s) => s.voidedAt === null);
  if (sales.length === 0) return null;

  async function send() {
    const to = await resolveRecipient(saleRecipientRows(sales));
    if (!to) return;
    await sendSalesInvoice({ phone: to.phone, customerName: to.name, sales });
    onSent();
  }

  return {
    key: "send-invoice",
    group: "send",
    icon: "receipt-outline",
    renderIcon: (size) => <WhatsAppComboIcon variant="report" size={size} />,
    label: t("invoice.send_invoice_whatsapp"),
    onPress: () => void send(),
  };
}
