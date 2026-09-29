import { useState } from "react";
import { Outlet } from "react-router";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { AppHeader } from "./AppHeader";
import { QuickActionDialogs } from "./QuickActionDialogs";
import { SideNav } from "./SideNav";

const NAV_WIDTH = 248;

// Below md the nav folds into a drawer; on desktop it is always on screen.
export function AppFrame() {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up("md"));
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = () => setNavOpen(false);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Drawer
        variant={desktop ? "permanent" : "temporary"}
        open={desktop || navOpen}
        onClose={closeNav}
        sx={{ width: desktop ? NAV_WIDTH : undefined, flexShrink: 0 }}
        slotProps={{ paper: { sx: { width: NAV_WIDTH } } }}
      >
        <SideNav onNavigate={desktop ? undefined : closeNav} />
      </Drawer>
      <Box sx={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <AppHeader onOpenNav={desktop ? undefined : () => setNavOpen(true)} />
        <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 3 } }}>
          <Outlet />
        </Box>
      </Box>
      <QuickActionDialogs />
    </Box>
  );
}
