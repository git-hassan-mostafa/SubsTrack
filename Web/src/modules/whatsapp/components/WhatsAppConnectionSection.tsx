import { useTranslation } from "react-i18next";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useWhatsAppConnection } from "@shared/modules/whatsapp/hooks/useWhatsAppConnection";
import { CONNECT_FROM_PARAM, CONNECT_FROM_WEB } from "@shared/modules/whatsapp/utils/constants";
import { InfoRows } from "@/shared/components/InfoRows";
import { StatusChip } from "@/shared/components/StatusChip";
import { SettingsSection } from "@/modules/admin/tenant-settings/components/SettingsSection";

// The signup page replaces this tab and is told to come back here, not to the phone app.
function openConnectPage(url: string) {
  const target = new URL(url);
  target.searchParams.set(CONNECT_FROM_PARAM, CONNECT_FROM_WEB);
  window.location.assign(target.toString());
}

export function WhatsAppConnectionSection() {
  const { t } = useTranslation();
  const connection = useWhatsAppConnection(openConnectPage);
  const { account, saving, configured } = connection;

  if (!account) {
    return (
      <SettingsSection title={t("whatsapp.connection_title")} hint={t("whatsapp.connect_intro")}>
        {!configured ? <Alert severity="warning">{t("whatsapp.errors.not_configured")}</Alert> : null}
        <FormControlLabel
          control={<Checkbox checked={connection.consent} onChange={connection.toggleConsent} />}
          label={t("whatsapp.consent_label")}
          sx={{ alignItems: "flex-start", "& .MuiCheckbox-root": { mt: -1 } }}
        />
        <Stack direction="row">
          <Button
            variant="contained"
            loading={saving}
            disabled={!connection.consent || !configured}
            onClick={() => void connection.connect()}
          >
            {t("whatsapp.connect")}
          </Button>
        </Stack>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title={t("whatsapp.connection_title")}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
        <StatusChip label={connection.statusLabel ?? ""} tone={connection.statusTone ?? "gray"} />
        {account.isCoexistence ? <StatusChip label={t("whatsapp.coexistence")} tone="sky" /> : null}
      </Stack>
      {connection.attentionText ? <Alert severity="warning">{connection.attentionText}</Alert> : null}
      <InfoRows rows={connection.infoRows} />
      <Typography variant="body2" color="text.secondary">
        {t("whatsapp.billing_note")}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
        <Button variant="outlined" loading={saving} onClick={() => void connection.refresh()}>
          {t("whatsapp.check_again")}
        </Button>
        <Button variant="outlined" disabled={saving || !configured} onClick={() => void connection.reconnect()}>
          {t("whatsapp.reconnect")}
        </Button>
        <Button variant="outlined" color="error" disabled={saving} onClick={() => void connection.disconnect()}>
          {t("whatsapp.disconnect")}
        </Button>
      </Stack>
    </SettingsSection>
  );
}
