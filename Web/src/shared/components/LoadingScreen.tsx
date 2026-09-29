import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { useTranslation } from "react-i18next";

export function LoadingScreen() {
  const { t } = useTranslation();
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <CircularProgress aria-label={t("web.loading")} />
    </Box>
  );
}
