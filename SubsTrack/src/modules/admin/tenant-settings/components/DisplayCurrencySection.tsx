import { useMemo } from 'react';
import { CARD_SURFACE } from "@/src/shared/constants";
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/shared/components/Text';
import { Dropdown, type DropdownOption } from '@/src/shared/components/Dropdown';
import { useCurrencySlice } from '@/src/state/hooks/useCurrencySlice';
import {
  useDisplayCurrencyId,
  useTenantSettingSlice,
} from '@/src/state/hooks/useTenantSettingSlice';

export function DisplayCurrencySection() {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const saving = useTenantSettingSlice((s) => s.saving);
  const setDisplayCurrencyId = useTenantSettingSlice((s) => s.setDisplayCurrencyId);

  const displayCurrencyOptions: DropdownOption<string>[] = useMemo(
    () =>
      currencies
        .filter((c) => c.active)
        .map((c) => ({ label: c.code, sublabel: c.name, value: c.id })),
    [currencies],
  );

  return (
    <View className={`${CARD_SURFACE} p-4 mb-4`}>
      <Text
        fontWeight="SemiBold"
        className="text-xs text-gray-400 uppercase tracking-wide mb-1"
      >
        {t('tenant_settings.display_section_title')}
      </Text>
      <Text className="text-xs text-gray-500 mb-3">
        {t('tenant_settings.display_currency_hint')}
      </Text>
      <Dropdown<string>
        label={t('tenant_settings.display_currency_label')}
        placeholder="USD"
        options={displayCurrencyOptions}
        value={displayCurrencyId}
        onChange={(value) => void setDisplayCurrencyId(value)}
        nullable
        nullLabel="USD"
        nullSublabel={t('tenant_settings.usd_base_note')}
        disabled={saving}
      />
    </View>
  );
}
