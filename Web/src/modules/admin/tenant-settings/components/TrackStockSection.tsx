import { useTranslation } from "react-i18next";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import {
  useTenantSettingSlice,
  useTracksStock,
} from "@shared/state/hooks/useTenantSettingSlice";
import { SettingsSection } from "./SettingsSection";

export function TrackStockSection() {
  const { t } = useTranslation();
  const tracksStock = useTracksStock();
  const saving = useTenantSettingSlice((s) => s.saving);
  const setTrackStock = useTenantSettingSlice((s) => s.setTrackStock);

  return (
    <SettingsSection title={t("tenant_settings.stock_section_title")}>
      <FormControlLabel
        sx={{ alignItems: "flex-start", mx: 0, justifyContent: "space-between", gap: 2 }}
        labelPlacement="start"
        control={
          <Switch
            checked={tracksStock}
            disabled={saving}
            onChange={(event) => void setTrackStock(event.target.checked)}
          />
        }
        label={
          <span>
            <Typography sx={{ fontWeight: 600 }}>{t("tenant_settings.track_stock_label")}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t("tenant_settings.track_stock_hint")}
            </Typography>
          </span>
        }
      />
      {tracksStock ? null : (
        <Typography variant="body2" color="warning.dark">
          {t("tenant_settings.track_stock_off_note")}
        </Typography>
      )}
    </SettingsSection>
  );
}
