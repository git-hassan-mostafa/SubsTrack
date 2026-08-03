import { useMemo } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/shared/components/Text';
import { Dropdown, type DropdownOption } from '@/src/shared/components/Dropdown';
import type { UnpaidStartRule } from '@/src/core/types';
import {
  useTenantSettingSlice,
  useUnpaidStartRule,
} from '@/src/state/hooks/useTenantSettingSlice';

export function UnpaidRuleSection() {
  const { t } = useTranslation();
  const rule = useUnpaidStartRule();
  const saving = useTenantSettingSlice((s) => s.saving);
  const setUnpaidStartRule = useTenantSettingSlice((s) => s.setUnpaidStartRule);

  const options: DropdownOption<UnpaidStartRule>[] = useMemo(
    () => [
      {
        label: t('tenant_settings.unpaid_rule_month_start'),
        sublabel: t('tenant_settings.unpaid_rule_month_start_hint'),
        value: 'month_start',
      },
      {
        label: t('tenant_settings.unpaid_rule_customer_start_day'),
        sublabel: t('tenant_settings.unpaid_rule_customer_start_day_hint'),
        value: 'customer_start_day',
      },
    ],
    [t],
  );

  return (
    <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
      <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
        {t('tenant_settings.unpaid_section_title')}
      </Text>
      <Text className="text-xs text-gray-500 mb-3">
        {t('tenant_settings.unpaid_rule_hint')}
      </Text>
      <Dropdown<UnpaidStartRule>
        label={t('tenant_settings.unpaid_rule_label')}
        options={options}
        value={rule}
        onChange={(value) => {
          if (value) void setUnpaidStartRule(value); // non-nullable dropdown
        }}
        disabled={saving}
      />
    </View>
  );
}
