import type { SvgIconComponent } from "@mui/icons-material";
import AccountBalanceOutlined from "@mui/icons-material/AccountBalanceOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import BlockOutlined from "@mui/icons-material/BlockOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import ChatBubbleOutlineOutlined from "@mui/icons-material/ChatBubbleOutlineOutlined";
import EditCalendarOutlined from "@mui/icons-material/EditCalendarOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import EventOutlined from "@mui/icons-material/EventOutlined";
import NotesOutlined from "@mui/icons-material/NotesOutlined";
import PersonOutlined from "@mui/icons-material/PersonOutlined";
import RemoveCircleOutlineOutlined from "@mui/icons-material/RemoveCircleOutlineOutlined";
import RequestQuoteOutlined from "@mui/icons-material/RequestQuoteOutlined";
import TagOutlined from "@mui/icons-material/TagOutlined";
import type { InfoKey, LabeledValue } from "@shared/modules/ledger/utils/billView";
import type { InfoRow } from "@/shared/components/InfoRows";

const INFO_ICONS: Record<InfoKey, SvgIconComponent> = {
  billing_month: CalendarMonthOutlined,
  bill_total: RequestQuoteOutlined,
  due_date: EventOutlined,
  issued_at: EditCalendarOutlined,
  recorded_by: PersonOutlined,
  received_at: EventAvailableOutlined,
  recorded_at: EditCalendarOutlined,
  collected_by: PersonOutlined,
  held_by: AccountBalanceWalletOutlined,
  banked_at: AccountBalanceOutlined,
  banked_by: PersonOutlined,
  notes: NotesOutlined,
  voided_at: BlockOutlined,
  voided_by: PersonOutlined,
  void_reason: ChatBubbleOutlineOutlined,
  written_off_at: RemoveCircleOutlineOutlined,
  written_off_by: PersonOutlined,
  write_off_reason: ChatBubbleOutlineOutlined,
  sold_at: EventOutlined,
  receipt_id: TagOutlined,
};

export function withInfoIcons(rows: LabeledValue[]): InfoRow[] {
  return rows.map((row) => ({ ...row, icon: INFO_ICONS[row.key] }));
}
