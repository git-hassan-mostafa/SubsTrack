import type { CustomerActionKey } from "@shared/modules/customer/customers/utils/customerMenu";
import type { Glyph } from "@/src/shared/lib/menuActions";
import { WhatsAppComboIcon } from "@/src/modules/invoicing";

export const CUSTOMER_ACTION_ICONS: Record<CustomerActionKey, Glyph> = {
  quick_pay: "flash-outline",
  quick_pay_whatsapp: "logo-whatsapp",
  record_sale: "receipt-outline",
  add_custom_debt: "document-text-outline",
  collect: "cash-outline",
  write_off_everything: "remove-circle-outline",
  whatsapp_chat: "logo-whatsapp",
  edit: "create-outline",
  history: "time-outline",
  deactivate: "pause-circle-outline",
  reactivate: "play-circle-outline",
  delete: "trash-outline",
};

export const CUSTOMER_ICON_BADGES: Partial<Record<CustomerActionKey, Glyph>> = {
  record_sale: "add",
  add_custom_debt: "add",
  collect: "add",
};

export function payAndSendIcon(size: number) {
  return <WhatsAppComboIcon variant="pay" size={size} />;
}
