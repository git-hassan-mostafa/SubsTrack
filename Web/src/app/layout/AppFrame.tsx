import { useTranslation } from "react-i18next";
import { Outlet } from "react-router";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { useAuthSlice } from "@shared/state/hooks/useAuthSlice";
import { endSession } from "@shared/shared/lib/session";

// Bare frame for B1 only; B2 replaces it with the left nav and full header.
export function AppFrame() {
  const { t } = useTranslation();
  const user = useAuthSlice((s) => s.user);

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar sx={{ gap: 2 }}>
          <Box component="img" src="/logo.png" alt="" sx={{ width: 28, height: 28 }} />
          <Typography sx={{ fontWeight: 700, flexGrow: 1 }}>
            {user?.tenant.name}
          </Typography>
          <Typography color="text.secondary">{user?.fullName}</Typography>
          <Button variant="outlined" onClick={() => void endSession()}>
            {t("settings.logout")}
          </Button>
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ p: 3 }}>
        <Outlet />
      </Box>
    </Box>
  );
}
