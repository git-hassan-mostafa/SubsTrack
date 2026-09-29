import { useTranslation } from "react-i18next";
import Typography from "@mui/material/Typography";

interface ComingSoonPageProps {
  titleKey: string;
}

export function ComingSoonPage({ titleKey }: ComingSoonPageProps) {
  const { t } = useTranslation();
  return (
    <>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
        {t(titleKey)}
      </Typography>
      <Typography color="text.secondary">{t("web.coming_soon")}</Typography>
    </>
  );
}
