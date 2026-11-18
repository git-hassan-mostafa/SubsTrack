import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { digitsOnly } from "@shared/core/utils/inputText";
import type { OwnAppConnect } from "@shared/modules/whatsapp/hooks/useOwnAppConnect";
import { SearchableSelect } from "@/shared/components/SearchableSelect";

const PIN_LENGTH = 6;

interface Props {
  ownApp: OwnAppConnect;
  onCancel: () => void;
}

export function OwnAppConnectForm({ ownApp, onCancel }: Props) {
  const { t } = useTranslation();

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
        <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700 }}>
          {t("whatsapp.own_app.title")}
        </Typography>
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
    </Stack>
  );
}
