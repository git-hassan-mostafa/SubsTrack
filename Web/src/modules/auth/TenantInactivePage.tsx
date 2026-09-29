import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import LockOutlined from "@mui/icons-material/LockOutlined";
import { endWebSession } from "@/state/webSession";

export function TenantInactivePage() {
  const { t } = useTranslation();
  return (
    <Box
      component="main"
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
      }}
    >
      <Paper
        variant="outlined"
        sx={{ width: "100%", maxWidth: 480, p: 4, textAlign: "center" }}
      >
        <LockOutlined color="error" sx={{ fontSize: 40, mb: 2 }} />
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 1.5 }}>
          {t("tenant_inactive.title")}
        </Typography>
        <Typography sx={{ mb: 1 }}>{t("tenant_inactive.message")}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          {t("tenant_inactive.contact_hint")}
        </Typography>
        <Button variant="outlined" onClick={() => void endWebSession()}>
          {t("settings.logout")}
        </Button>
      </Paper>
    </Box>
  );
}
