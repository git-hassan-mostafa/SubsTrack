import type { SvgIconComponent } from "@mui/icons-material";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import WhatsApp from "@mui/icons-material/WhatsApp";
import type { PaymentActionKey } from "@shared/modules/ledger/utils/collectionView";

export const PAYMENT_ACTION_ICONS: Record<PaymentActionKey, SvgIconComponent> = {
  details: ReceiptLongOutlined,
  invoice: WhatsApp,
  correct: EditOutlined,
  void: DeleteOutlined,
};
