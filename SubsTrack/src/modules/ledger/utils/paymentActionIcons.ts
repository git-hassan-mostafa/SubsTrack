import type { Glyph } from "@/src/shared/lib/menuActions";
import type { PaymentActionKey } from "@shared/modules/ledger/utils/collectionView";

export const PAYMENT_ACTION_ICONS: Record<PaymentActionKey, Glyph> = {
  details: "receipt-outline",
  invoice: "logo-whatsapp",
  correct: "create-outline",
  void: "trash-outline",
};
