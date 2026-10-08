import type { SvgIconComponent } from "@mui/icons-material";
import BoltOutlined from "@mui/icons-material/BoltOutlined";
import CancelOutlined from "@mui/icons-material/CancelOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import RemoveCircleOutlineOutlined from "@mui/icons-material/RemoveCircleOutlineOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import ReplayOutlined from "@mui/icons-material/ReplayOutlined";
import SkipNextOutlined from "@mui/icons-material/SkipNextOutlined";
import UndoOutlined from "@mui/icons-material/UndoOutlined";
import WhatsApp from "@mui/icons-material/WhatsApp";
import type {
  MonthMenuKey,
  MonthSelectionKey,
} from "@shared/modules/customer/customer-payments/utils/monthActions";

export const MONTH_MENU_ICONS: Record<MonthMenuKey, SvgIconComponent> = {
  open: OpenInNewOutlined,
  "quick-pay": BoltOutlined,
  "quick-pay-whatsapp": WhatsApp,
  "collect-part": PaymentsOutlined,
  skip: SkipNextOutlined,
  unskip: ReplayOutlined,
  bill: ReceiptLongOutlined,
  "collect-remaining": PaymentsOutlined,
  history: HistoryOutlined,
  "write-off": RemoveCircleOutlineOutlined,
  "revert-write-off": UndoOutlined,
  "void-month": CancelOutlined,
};

export const MONTH_SELECTION_ICONS: Record<MonthSelectionKey, SvgIconComponent> = {
  pay: PaymentsOutlined,
  "pay-whatsapp": WhatsApp,
  skip: SkipNextOutlined,
  unskip: ReplayOutlined,
  "write-off": RemoveCircleOutlineOutlined,
};
