import type { SvgIconComponent } from "@mui/icons-material";
import CancelOutlined from "@mui/icons-material/CancelOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import WhatsApp from "@mui/icons-material/WhatsApp";
import type { SaleActionKey } from "@shared/modules/transaction/sales/utils/saleView";

export const SALE_ACTION_ICONS: Record<SaleActionKey, SvgIconComponent> = {
  view: ReceiptLongOutlined,
  edit: EditOutlined,
  collect: PaymentsOutlined,
  invoice: WhatsApp,
  history: HistoryOutlined,
  void: CancelOutlined,
};
