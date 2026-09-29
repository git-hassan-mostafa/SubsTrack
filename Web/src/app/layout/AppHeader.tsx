import { useTranslation } from "react-i18next";
import AppBar from "@mui/material/AppBar";
import IconButton from "@mui/material/IconButton";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import MenuIcon from "@mui/icons-material/Menu";
import { BranchSelector } from "@/shared/components/BranchSelector";
import { QuickActions } from "./QuickActions";
import { UserMenu } from "./UserMenu";
import { usePageTitle } from "./usePageTitle";

interface AppHeaderProps {
  onOpenNav?: () => void;
}

export function AppHeader({ onOpenNav }: AppHeaderProps) {
  const { t } = useTranslation();
  const title = usePageTitle();

  return (
    <AppBar
      position="sticky"
      color="inherit"
      elevation={0}
      sx={{ borderBottom: 1, borderColor: "divider" }}
    >
      <Toolbar sx={{ gap: 1.5 }}>
        {onOpenNav ? (
          <Tooltip title={t("web.open_navigation")}>
            <IconButton edge="start" aria-label={t("web.open_navigation")} onClick={onOpenNav}>
              <MenuIcon />
            </IconButton>
          </Tooltip>
        ) : null}
        <Typography variant="h6" component="h1" noWrap sx={{ fontWeight: 700, flexGrow: 1 }}>
          {title}
        </Typography>
        <QuickActions />
        <BranchSelector />
        <UserMenu />
      </Toolbar>
    </AppBar>
  );
}
