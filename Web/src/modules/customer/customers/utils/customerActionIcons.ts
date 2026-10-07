import type { SvgIconComponent } from "@mui/icons-material";
import BoltOutlined from "@mui/icons-material/BoltOutlined";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import NoteAddOutlined from "@mui/icons-material/NoteAddOutlined";
import PauseCircleOutlined from "@mui/icons-material/PauseCircleOutlined";
import PlayCircleOutlined from "@mui/icons-material/PlayCircleOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import PointOfSaleOutlined from "@mui/icons-material/PointOfSaleOutlined";
import RemoveCircleOutlineOutlined from "@mui/icons-material/RemoveCircleOutlineOutlined";
import WhatsApp from "@mui/icons-material/WhatsApp";
import type { CustomerActionKey } from "@shared/modules/customer/customers/utils/customerMenu";

export const CUSTOMER_ACTION_ICONS: Record<CustomerActionKey, SvgIconComponent> = {
  quick_pay: BoltOutlined,
  quick_pay_whatsapp: WhatsApp,
  record_sale: PointOfSaleOutlined,
  add_custom_debt: NoteAddOutlined,
  collect: PaymentsOutlined,
  write_off_all: RemoveCircleOutlineOutlined,
  whatsapp_chat: WhatsApp,
  edit: EditOutlined,
  history: HistoryOutlined,
  deactivate: PauseCircleOutlined,
  reactivate: PlayCircleOutlined,
  delete: DeleteOutlined,
};
