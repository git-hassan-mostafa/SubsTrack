import type { SvgIconComponent } from "@mui/icons-material";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import CallSplitOutlined from "@mui/icons-material/CallSplitOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import ShoppingBagOutlined from "@mui/icons-material/ShoppingBagOutlined";
import type { WalletSource } from "@shared/core/types";
import type { ChipTone } from "@/shared/components/chipTones";

// The phone's kind pill colours, so a payment's type reads the same on both apps.
export const KIND_TONE: Record<WalletSource, ChipTone> = {
  month: "emerald",
  sale: "emerald",
  manual: "violet",
  mixed: "indigo",
};

export const KIND_ICON: Record<WalletSource, SvgIconComponent> = {
  month: CalendarMonthOutlined,
  sale: ShoppingBagOutlined,
  manual: DescriptionOutlined,
  mixed: CallSplitOutlined,
};
