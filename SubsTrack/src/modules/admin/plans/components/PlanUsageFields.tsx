import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Dropdown } from "@/src/shared/components/Dropdown";
import { FieldLabel } from "@/src/shared/components/FieldLabel";
import { Input } from "@/src/shared/components/Input";
import { SegmentedTabs } from "@/src/shared/components/SegmentedTabs";
import { Text } from "@/src/shared/components/Text";
import type { Currency, PlanUsage, UsageEntry } from "@shared/core/types";
import { currencyChoices, currencyPickOptions } from "@shared/core/utils/currency";
import { amountText, digitsOnly, parseAmount } from "@shared/core/utils/inputText";

interface Props {
  usage: PlanUsage;
  currencyId: string | null;
  currencies: Currency[];
  entryLocked: boolean;
  onChange: (patch: Partial<PlanUsage>) => void;
  onCurrencyChange: (currencyId: string | null) => void;
  onFocus: () => void;
}

export function PlanUsageFields({
  usage,
  currencyId,
  currencies,
  entryLocked,
  onChange,
  onCurrencyChange,
  onFocus,
}: Props) {
  const { t } = useTranslation();
  const entryLabel =
    usage.entry === "reading" ? t("plans.usage_entry_reading") : t("plans.usage_entry_direct");
  return (
    <>
      <View className="mb-4">
        <FieldLabel className="mb-2">{t("plans.usage_entry_label")}</FieldLabel>
        {entryLocked ? (
          <Text fontWeight="SemiBold" className="text-sm text-gray-900">
            {entryLabel}
          </Text>
        ) : (
          <SegmentedTabs<UsageEntry>
            value={usage.entry}
            onChange={(entry) => onChange({ entry })}
            segments={[
              { key: "reading", label: t("plans.usage_entry_reading") },
              { key: "direct", label: t("plans.usage_entry_direct") },
            ]}
          />
        )}
        <Text className="text-xs text-gray-400 mt-1.5">
          {entryLocked
            ? t("plans.usage_entry_locked_hint")
            : usage.entry === "reading"
              ? t("plans.usage_entry_reading_hint")
              : t("plans.usage_entry_direct_hint")}
        </Text>
      </View>

      <Input
        label={t("plans.unit_name_label") + " *"}
        value={usage.unitName}
        onChangeText={(unitName) => onChange({ unitName })}
        placeholder={t("plans.unit_name_placeholder")}
        onFocus={onFocus}
      />

      <Input
        label={t("plans.fee_name_label") + " *"}
        value={usage.feeName}
        onChangeText={(feeName) => onChange({ feeName })}
        placeholder={t("plans.fee_name_placeholder")}
        onFocus={onFocus}
      />

      <Dropdown<string>
        label={t("plans.usage_currency_label")}
        options={currencyPickOptions(currencyChoices(currencies, currencyId))}
        value={currencyId}
        onChange={onCurrencyChange}
        nullable
        nullLabel="USD"
      />

      <Input
        label={t("plans.high_usage_label")}
        value={amountText(usage.highUsagePercent)}
        onChangeText={(text) => onChange({ highUsagePercent: parseAmount(text) })}
        sanitize={digitsOnly}
        placeholder={t("plans.high_usage_placeholder")}
        keyboardType="number-pad"
        onFocus={onFocus}
      />
      <Text className="text-xs text-gray-400 -mt-3 mb-4">
        {t("plans.high_usage_hint")}
      </Text>
    </>
  );
}
