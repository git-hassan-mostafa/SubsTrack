import type { SvgIconComponent } from "@mui/icons-material";
import CancelOutlined from "@mui/icons-material/CancelOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import RemoveCircleOutlineOutlined from "@mui/icons-material/RemoveCircleOutlineOutlined";
import UndoOutlined from "@mui/icons-material/UndoOutlined";
import type { BillActionKey } from "@shared/modules/ledger/utils/billView";

export const BILL_ACTION_ICONS: Record<BillActionKey, SvgIconComponent> = {
  history: HistoryOutlined,
  revert_write_off: UndoOutlined,
  write_off: RemoveCircleOutlineOutlined,
  void: CancelOutlined,
};
