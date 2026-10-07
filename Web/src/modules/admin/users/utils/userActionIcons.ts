import type { SvgIconComponent } from "@mui/icons-material";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import PauseCircleOutlined from "@mui/icons-material/PauseCircleOutlined";
import PlayCircleOutlined from "@mui/icons-material/PlayCircleOutlined";
import type { UserActionKey } from "@shared/modules/admin/users/utils/userMenu";

export const USER_ACTION_ICONS: Record<UserActionKey, SvgIconComponent> = {
  edit: EditOutlined,
  history: HistoryOutlined,
  deactivate: PauseCircleOutlined,
  reactivate: PlayCircleOutlined,
  delete: DeleteOutlined,
};
