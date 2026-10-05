import type { Glyph } from "@/src/shared/lib/menuActions";
import type { SaleActionKey } from "@shared/modules/transaction/sales/utils/saleView";
import { WhatsAppComboIcon } from "@/src/modules/invoicing";

export const SALE_ACTION_ICONS: Record<SaleActionKey, Glyph> = {
  view: "receipt-outline",
  edit: "create-outline",
  collect: "cash-outline",
  invoice: "logo-whatsapp",
  history: "time-outline",
  void: "close-circle-outline",
};

export const SALE_RENDER_ICONS = {
  invoice: (size: number) => <WhatsAppComboIcon variant="report" size={size} />,
};
