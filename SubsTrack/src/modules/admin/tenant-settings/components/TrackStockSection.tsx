import { Switch, View } from "react-native";
import { useTranslation } from "react-i18next";
import { CARD_SURFACE } from "@/src/shared/constants";
import { Text } from "@/src/shared/components/Text";
import { SectionLabel } from "@/src/shared/components/SectionLabel";
import {
  useTenantSettingSlice,
  useTracksStock,
} from "@shared/state/hooks/useTenantSettingSlice";

export function TrackStockSection() {
  const { t } = useTranslation();
  const tracksStock = useTracksStock();
  const saving = useTenantSettingSlice((s) => s.saving);
  const setTrackStock = useTenantSettingSlice((s) => s.setTrackStock);

  return (
    <View className={`${CARD_SURFACE} p-4 mb-4`}>
      <SectionLabel className="mb-3">
        {t("tenant_settings.stock_section_title")}
      </SectionLabel>
      <View className="flex-row items-center justify-between">
        <View className="flex-1 me-4">
          <Text fontWeight="SemiBold" className="text-sm text-gray-900">
            {t("tenant_settings.track_stock_label")}
          </Text>
          <Text className="text-xs text-gray-500 mt-0.5">
            {t("tenant_settings.track_stock_hint")}
          </Text>
        </View>
        <Switch
          value={tracksStock}
          onValueChange={(on) => void setTrackStock(on)}
          disabled={saving}
        />
      </View>
      {tracksStock ? null : (
        <Text className="text-xs text-amber-700 mt-3">
          {t("tenant_settings.track_stock_off_note")}
        </Text>
      )}
    </View>
  );
}
