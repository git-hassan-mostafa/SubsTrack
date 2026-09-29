import type { SvgIconComponent } from "@mui/icons-material";
import type { ActionGroup } from "@shared/shared/lib/actionOrder";

export interface TableAction {
  key: string;
  group?: ActionGroup;
  label: string;
  icon: SvgIconComponent;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}
