import type { TFunction } from "i18next";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import WhatsApp from "@mui/icons-material/WhatsApp";
import type { TableAction } from "@/shared/table/tableAction";

interface PaymentActionHandlers {
  onDetails?: () => void;
  onSend?: () => void;
  onCorrect?: () => void;
  onVoid?: () => void;
}

// One menu for a payment row, so a bill's payments and Money received match.
export function paymentActions(t: TFunction, handlers: PaymentActionHandlers): TableAction[] {
  const actions: TableAction[] = [];
  if (handlers.onDetails) {
    actions.push({
      key: "details",
      group: "open",
      label: t("ledger.payment_details"),
      icon: ReceiptLongOutlined,
      onClick: handlers.onDetails,
    });
  }
  if (handlers.onSend) {
    actions.push({
      key: "invoice",
      group: "send",
      label: t("invoicing.send_on_whatsapp"),
      icon: WhatsApp,
      onClick: handlers.onSend,
    });
  }
  if (handlers.onCorrect) {
    actions.push({
      key: "correct",
      group: "manage",
      label: t("ledger.correct_payment"),
      caption: t("ledger.correct_payment_caption"),
      icon: EditOutlined,
      onClick: handlers.onCorrect,
    });
  }
  if (handlers.onVoid) {
    actions.push({
      key: "void",
      group: "danger",
      label: t("ledger.void_payment"),
      icon: DeleteOutlined,
      destructive: true,
      onClick: handlers.onVoid,
    });
  }
  return actions;
}
