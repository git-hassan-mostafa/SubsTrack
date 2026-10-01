import type { SvgIconComponent } from "@mui/icons-material";
import BlockOutlined from "@mui/icons-material/BlockOutlined";
import HourglassEmptyOutlined from "@mui/icons-material/HourglassEmptyOutlined";
import PieChartOutlined from "@mui/icons-material/PieChartOutlined";
import RemoveCircleOutlineOutlined from "@mui/icons-material/RemoveCircleOutlineOutlined";
import TaskAltOutlined from "@mui/icons-material/TaskAltOutlined";
import type { ChargeStatus } from "@shared/core/types";
import type { ChipTone } from "@/shared/components/chipTones";

export interface BillStatusLook {
  tone: ChipTone;
  icon: SvgIconComponent;
  labelKey: string;
  messageKey: string;
  amountColor: string;
  struck: boolean;
}

const LOOKS: Record<ChargeStatus, BillStatusLook> = {
  void: {
    tone: "red",
    icon: BlockOutlined,
    labelKey: "ledger.voided",
    messageKey: "web.bill.status_void",
    amountColor: "text.disabled",
    struck: true,
  },
  written_off: {
    tone: "orange",
    icon: RemoveCircleOutlineOutlined,
    labelKey: "ledger.written_off",
    messageKey: "web.bill.status_written_off",
    amountColor: "warning.dark",
    struck: false,
  },
  settled: {
    tone: "emerald",
    icon: TaskAltOutlined,
    labelKey: "web.bill.label_settled",
    messageKey: "web.bill.status_settled",
    amountColor: "success.main",
    struck: false,
  },
  partial: {
    tone: "amber",
    icon: PieChartOutlined,
    labelKey: "ledger.partial",
    messageKey: "web.bill.status_partial",
    amountColor: "warning.dark",
    struck: false,
  },
  open: {
    tone: "red",
    icon: HourglassEmptyOutlined,
    labelKey: "web.bill.label_open",
    messageKey: "web.bill.status_open",
    amountColor: "error.main",
    struck: false,
  },
};

// The phone's bill colours in MUI terms, plus an icon and a sentence per state.
export function billStatusLook(status: ChargeStatus): BillStatusLook {
  return LOOKS[status];
}
