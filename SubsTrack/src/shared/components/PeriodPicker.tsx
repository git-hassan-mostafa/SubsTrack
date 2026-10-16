import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { FilterChip } from "./FilterChip";
import { DatePickerInput } from "./DatePickerInput";
import { formatDate } from "@shared/core/utils/date";
import {
  PERIOD_PRESETS,
  periodFromPreset,
  type PeriodPreset,
  type ReportPeriod,
} from "@shared/core/utils/dateRange";

interface Props {
  value: ReportPeriod;
  onChange: (period: ReportPeriod) => void;
}

export function PeriodPicker({ value, onChange }: Props) {
  const { t } = useTranslation();
  const [customOpen, setCustomOpen] = useState(value.preset === "custom");

  const pick = (preset: PeriodPreset) => {
    if (preset === "custom") {
      setCustomOpen(true);
      onChange({ ...value, preset: "custom" });
      return;
    }
    setCustomOpen(false);
    onChange(periodFromPreset(preset));
  };

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 px-4"
      >
        {PERIOD_PRESETS.map((preset) => (
          <FilterChip
            key={preset}
            label={t(`reports.period_${preset}`)}
            active={value.preset === preset}
            onPress={() => pick(preset)}
          />
        ))}
      </ScrollView>

      {customOpen ? (
        <View className="flex-row items-center gap-2 px-4 mt-2">
          <View className="flex-1">
            <DatePickerInput
              value={value.fromDate}
              maxDate={value.toDate}
              triggerStyle="chip"
              onChange={(from) =>
                onChange({
                  preset: "custom",
                  fromDate: from,
                  toDate: value.toDate,
                })
              }
            />
          </View>
          <Text className="text-xs text-gray-400">→</Text>
          <View className="flex-1">
            <DatePickerInput
              value={value.toDate}
              minDate={value.fromDate}
              triggerStyle="chip"
              onChange={(to) =>
                onChange({
                  preset: "custom",
                  fromDate: value.fromDate,
                  toDate: to,
                })
              }
            />
          </View>
        </View>
      ) : (
        <Text className="text-xs text-gray-400 px-4 mt-2">
          {formatDate(value.fromDate)} — {formatDate(value.toDate)}
        </Text>
      )}
    </View>
  );
}
