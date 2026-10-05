import type { SvgIconComponent } from "@mui/icons-material";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import PauseCircleOutlined from "@mui/icons-material/PauseCircleOutlined";
import PlayCircleOutlined from "@mui/icons-material/PlayCircleOutlined";
import type { CatalogActionKey } from "@shared/shared/lib/catalogMenu";

export const CATALOG_ACTION_ICONS: Record<CatalogActionKey, SvgIconComponent> = {
  edit: EditOutlined,
  stock: Inventory2Outlined,
  history: HistoryOutlined,
  deactivate: PauseCircleOutlined,
  reactivate: PlayCircleOutlined,
  delete: DeleteOutlined,
};
