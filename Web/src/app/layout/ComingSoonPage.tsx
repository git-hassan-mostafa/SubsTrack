import { useTranslation } from "react-i18next";
import Typography from "@mui/material/Typography";

export function ComingSoonPage() {
  const { t } = useTranslation();
  return <Typography color="text.secondary">{t("web.coming_soon")}</Typography>;
}
