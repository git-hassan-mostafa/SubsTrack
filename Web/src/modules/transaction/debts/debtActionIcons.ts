import type { SvgIconComponent } from "@mui/icons-material";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import RemoveCircleOutlineOutlined from "@mui/icons-material/RemoveCircleOutlineOutlined";
import UndoOutlined from "@mui/icons-material/UndoOutlined";
import type { DebtItemActionKey } from "@shared/modules/transaction/debts/utils/debtItemView";

export const DEBT_ACTION_ICONS: Record<DebtItemActionKey, SvgIconComponent> = {
  collect: PaymentsOutlined,
  revert_write_off: UndoOutlined,
  edit: EditOutlined,
  write_off: RemoveCircleOutlineOutlined,
  remove: DeleteOutlined,
};
