import type { SvgIconComponent } from "@mui/icons-material";
import CancelScheduleSendOutlined from "@mui/icons-material/CancelScheduleSendOutlined";
import ChatOutlined from "@mui/icons-material/ChatOutlined";
import NotificationsOffOutlined from "@mui/icons-material/NotificationsOffOutlined";
import NotificationsOutlined from "@mui/icons-material/NotificationsOutlined";
import WhatsApp from "@mui/icons-material/WhatsApp";
import type {
  WhatsAppActionKey,
  WhatsAppMessageActionKey,
} from "@shared/modules/whatsapp/utils/whatsappMenu";

export const WHATSAPP_ACTION_ICONS: Record<WhatsAppActionKey, SvgIconComponent> = {
  whatsapp_reminder: WhatsApp,
  whatsapp_message: ChatOutlined,
  whatsapp_send: WhatsApp,
  whatsapp_stop: NotificationsOffOutlined,
  whatsapp_allow: NotificationsOutlined,
};

export const WHATSAPP_MESSAGE_ACTION_ICONS: Record<WhatsAppMessageActionKey, SvgIconComponent> = {
  cancel_batch: CancelScheduleSendOutlined,
};
