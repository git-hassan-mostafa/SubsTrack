import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <Box component="main" sx={{ p: 4, textAlign: "center" }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
        {t("web.not_found_title")}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t("web.not_found_message")}
      </Typography>
      <Button variant="contained" href="/">
        {t("web.go_home")}
      </Button>
    </Box>
  );
}
