import type { SvgIconComponent } from "@mui/icons-material";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import RemoveCircleOutlineOutlined from "@mui/icons-material/RemoveCircleOutlineOutlined";
import UndoOutlined from "@mui/icons-material/UndoOutlined";
import type { OwedItemActionKey } from "@shared/modules/transaction/to-collect/utils/owedItemView";
import type { OwingCustomerActionKey } from "@shared/modules/transaction/to-collect/utils/toCollectView";

export const OWED_ACTION_ICONS: Record<OwedItemActionKey, SvgIconComponent> = {
  collect: PaymentsOutlined,
  revert_write_off: UndoOutlined,
  edit: EditOutlined,
  write_off: RemoveCircleOutlineOutlined,
  remove: DeleteOutlined,
};

export const OWING_CUSTOMER_ACTION_ICONS: Record<OwingCustomerActionKey, SvgIconComponent> = {
  collect_all: PaymentsOutlined,
  write_off_everything: RemoveCircleOutlineOutlined,
};
