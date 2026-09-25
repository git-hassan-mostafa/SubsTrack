import type { ActionMenuItem } from "@/src/shared/components/ActionMenu";

type Translate = (key: string) => string;

interface PaymentMenuHandlers {
  onSend?: () => void;
  onCorrect?: () => void;
  onVoid?: () => void;
}

// One menu for a payment row, so the bill sheet and Money received match.
export function paymentMenu(
  t: Translate,
  handlers: PaymentMenuHandlers,
): ActionMenuItem[] {
  const actions: ActionMenuItem[] = [];
  if (handlers.onSend) {
    actions.push({
      key: "invoice",
      group: "send",
      label: t("invoicing.send_on_whatsapp"),
      icon: "logo-whatsapp",
      onPress: handlers.onSend,
    });
  }
  if (handlers.onCorrect) {
    actions.push({
      key: "correct",
      group: "manage",
      label: t("ledger.correct_payment"),
      icon: "create-outline",
      caption: t("ledger.correct_payment_caption"),
      onPress: handlers.onCorrect,
    });
  }
  if (handlers.onVoid) {
    actions.push({
      key: "void",
      group: "danger",
      label: t("ledger.void_payment"),
      icon: "trash-outline",
      destructive: true,
      onPress: handlers.onVoid,
    });
  }
  return actions;
}
