import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

interface Props {
  title: string;
  message: string;
}

// A full reload, never a client navigation: the running code is what failed or is out of date.
export function ReloadPage({ title, message }: Props) {
  const { t } = useTranslation();
  return (
    <Box component="main" sx={{ p: 4, textAlign: "center" }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
        {title}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {message}
      </Typography>
      <Button variant="contained" onClick={() => window.location.reload()}>
        {t("web.reload")}
      </Button>
    </Box>
  );
}
