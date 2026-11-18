import { useTranslation } from "react-i18next";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import type { WhatsAppWebhookInfo } from "@shared/core/types";

interface Props {
  info: WhatsAppWebhookInfo;
}

export function WebhookSetupBox({ info }: Props) {
  const { t } = useTranslation();

  return (
    <Alert severity="warning">
      <AlertTitle>{t("whatsapp.own_app.webhook_title")}</AlertTitle>
      <Stack spacing={2}>
        {t("whatsapp.own_app.webhook_hint")}
        <TextField
          label={t("whatsapp.own_app.webhook_url")}
          value={info.url}
          size="small"
          fullWidth
          slotProps={{ htmlInput: { readOnly: true } }}
        />
        <TextField
          label={t("whatsapp.own_app.webhook_token")}
          value={info.verifyToken}
          size="small"
          fullWidth
          slotProps={{ htmlInput: { readOnly: true } }}
        />
      </Stack>
    </Alert>
  );
}
