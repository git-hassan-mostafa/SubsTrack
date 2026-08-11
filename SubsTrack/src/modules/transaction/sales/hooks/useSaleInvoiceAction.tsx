import { useTranslation } from "react-i18next";
import type { Sale } from "@/src/core/types";
import type { SelectionAction } from "@/src/shared/components/SelectionBar";
import { useSendInvoice, WhatsAppComboIcon } from "@/src/modules/invoicing";

// The "send invoice" selection action shared by the two sales lists (the
// Transactions tab and the per-customer page): one receipt covering every
// selected sale. A voided sale is not a receipt, so it drops out of the
// selection; a selection that can't be sent (several customers, walk-in, no
// phone) keeps the action and explains itself on press — see resolveRecipient.
export function useSaleInvoiceAction(
  selected: Sale[],
  onSent: () => void,
): SelectionAction | null {
  const { t } = useTranslation();
  const { sendSalesInvoice, resolveRecipient } = useSendInvoice();

  const sales = selected.filter((s) => s.voidedAt === null);
  if (sales.length === 0) return null;

  async function send() {
    const to = await resolveRecipient(
      sales.map((s) => ({
        customerId: s.customerId,
        customerName: s.customer?.name ?? null,
        phone: s.customer?.phoneNumber ?? null,
      })),
    );
    if (!to) return;
    await sendSalesInvoice({ phone: to.phone, customerName: to.name, sales });
    onSent();
  }

  return {
    key: "send-invoice",
    icon: "receipt-outline",
    renderIcon: (size) => <WhatsAppComboIcon variant="report" size={size} />,
    label: t("invoice.send_invoice_whatsapp"),
    onPress: () => void send(),
  };
}
