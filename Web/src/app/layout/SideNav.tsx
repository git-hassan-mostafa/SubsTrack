import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import ListSubheader from "@mui/material/ListSubheader";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { canOpen } from "@shared/modules/authentication/auth/utils/pageAccess";
import { APP_PAGES, type AppPage, type NavSection } from "@/app/routes/appPages";

interface SideNavProps {
  onNavigate?: () => void;
}

function isCurrent(pathname: string, page: AppPage): boolean {
  const base = `/${page.path}`;
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function SideNav({ onNavigate }: SideNavProps) {
  const { t } = useTranslation();
  const viewer = useAuth();
  const { pathname } = useLocation();

  const pagesIn = (section: NavSection) =>
    APP_PAGES.filter((page) => page.nav === section && canOpen(viewer, page.access));
  const adminPages = pagesIn("admin");

  const renderItem = (page: AppPage) => {
    const Icon = page.icon;
    const current = isCurrent(pathname, page);
    return (
      <ListItemButton
        key={page.path}
        href={`/${page.path}`}
        selected={current}
        aria-current={current ? "page" : undefined}
        onClick={onNavigate}
        sx={{ borderRadius: 1, mx: 1, mb: 0.25 }}
      >
        <ListItemIcon>
          <Icon fontSize="small" color={current ? "primary" : undefined} />
        </ListItemIcon>
        <ListItemText
          primary={t(page.titleKey)}
          slotProps={{ primary: { sx: { fontWeight: current ? 700 : 500 } } }}
        />
      </ListItemButton>
    );
  };

  return (
    <>
      <Toolbar sx={{ gap: 1.5 }}>
        <Box component="img" src="/logo.png" alt="" sx={{ width: 28, height: 28 }} />
        <Typography noWrap sx={{ fontWeight: 700 }}>
          {viewer.user?.tenant.name}
        </Typography>
      </Toolbar>
      <Box component="nav" aria-label={t("web.main_navigation")} sx={{ overflowY: "auto", pb: 2 }}>
        <List>{pagesIn("main").map(renderItem)}</List>
        {adminPages.length > 0 ? (
          <List
            subheader={
              <ListSubheader disableSticky sx={{ bgcolor: "transparent", lineHeight: "32px" }}>
                {t("admin.title")}
              </ListSubheader>
            }
          >
            {adminPages.map(renderItem)}
          </List>
        ) : null}
      </Box>
    </>
  );
}
