import { useState } from "react";
import { useTranslation } from "react-i18next";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { digitsOnly } from "@shared/core/utils/inputText";
import type { OwnAppConnect } from "@shared/modules/whatsapp/hooks/useOwnAppConnect";
import { OWN_APP_HELP_STEP_KEYS } from "@shared/modules/whatsapp/utils/ownAppForm";
import { SearchableSelect } from "@/shared/components/SearchableSelect";

const PIN_LENGTH = 6;

interface Props {
  ownApp: OwnAppConnect;
  onCancel: () => void;
}

export function OwnAppConnectForm({ ownApp, onCancel }: Props) {
  const { t } = useTranslation();
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <Stack
      spacing={2}
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        void ownApp.submit();
      }}
    >
      <Divider />
      <Stack spacing={0.5}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700 }}>
            {t("whatsapp.own_app.title")}
          </Typography>
          <IconButton
            size="small"
            aria-label={t("whatsapp.own_app.help_open")}
            onClick={() => setHelpOpen(true)}
          >
            <InfoOutlined fontSize="small" />
          </IconButton>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {t("whatsapp.own_app.intro")}
        </Typography>
      </Stack>
      <TextField
        label={t("whatsapp.own_app.token_label")}
        type="password"
        autoComplete="off"
        value={ownApp.token}
        onChange={(event) => ownApp.setToken(event.target.value)}
        fullWidth
      />
      <TextField
        label={t("whatsapp.own_app.secret_label")}
        type="password"
        autoComplete="off"
        value={ownApp.appSecret}
        onChange={(event) => ownApp.setAppSecret(event.target.value)}
        fullWidth
      />
      {ownApp.step === "choose_number" ? (
        <SearchableSelect
          label={t("whatsapp.own_app.number_label")}
          helperText={t("whatsapp.own_app.number_hint")}
          options={ownApp.numberOptions}
          value={ownApp.phoneNumberId}
          onChange={ownApp.choosePhoneNumber}
          fullWidth
        />
      ) : null}
      {ownApp.step === "pin" ? (
        <TextField
          label={t("whatsapp.own_app.pin_label")}
          helperText={t("whatsapp.own_app.pin_hint")}
          type="password"
          autoComplete="off"
          value={ownApp.pin}
          onChange={(event) => ownApp.setPin(digitsOnly(event.target.value).slice(0, PIN_LENGTH))}
          slotProps={{ htmlInput: { inputMode: "numeric" } }}
          sx={{ maxWidth: 240 }}
        />
      ) : null}
      <Stack direction="row" spacing={1}>
        <Button type="submit" variant="contained" loading={ownApp.saving} disabled={!ownApp.canSubmit}>
          {t("whatsapp.own_app.submit")}
        </Button>
        <Button variant="text" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </Stack>
      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t("whatsapp.own_app.help_title")}</DialogTitle>
        <DialogContent>
          <Stack component="ol" spacing={1.5} sx={{ m: 0, paddingInlineStart: 3 }}>
            {OWN_APP_HELP_STEP_KEYS.map((key) => (
              <Typography key={key} component="li" variant="body2">
                {t(key)}
              </Typography>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHelpOpen(false)}>{t("common.close")}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
