import { useTranslation } from "react-i18next";
import type { SvgIconComponent } from "@mui/icons-material";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { sortActions, type ActionGroup } from "@shared/shared/lib/actionOrder";

export interface QuickAction {
  key: string;
  group: ActionGroup;
  labelKey: string;
  icon: SvgIconComponent;
  onClick: () => void;
}

// Only actions whose dialog or page already works on the web belong here.
function useQuickActions(): QuickAction[] {
  return [];
}

export function QuickActions() {
  const { t } = useTranslation();
  const actions = sortActions(useQuickActions());
  return actions.map((action) => {
    const Icon = action.icon;
    const label = t(action.labelKey);
    return (
      <Tooltip key={action.key} title={label}>
        <IconButton aria-label={label} onClick={action.onClick}>
          <Icon />
        </IconButton>
      </Tooltip>
    );
  });
}
