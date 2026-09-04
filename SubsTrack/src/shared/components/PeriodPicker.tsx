import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "./PressableOpacity/PressableOpacity";
import { DatePickerInput } from "./DatePickerInput";
import { formatDate } from "@/src/core/utils/date";
import {
  PERIOD_PRESETS,
  periodFromPreset,
  type PeriodPreset,
  type ReportPeriod,
} from "@/src/core/utils/dateRange";

interface Props {
  value: ReportPeriod;
  onChange: (period: ReportPeriod) => void;
}

/**
 * Preset chips + a custom From/To range. Lives in `shared/` rather than in the
 * reports module because Expenses, Sales and Audit all hand-roll their own
 * from/to pair today and can adopt this without a dependency on reports.
 */
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
        {PERIOD_PRESETS.map((preset) => {
          const active = value.preset === preset;
          return (
            <PressableOpacity
              key={preset}
              onPress={() => pick(preset)}
              className={`px-3 py-1.5 rounded-full border ${
                active ? "bg-primary border-primary" : "bg-white border-gray-200"
              }`}
            >
              <Text className={`text-xs ${active ? "text-white" : "text-gray-600"}`}>
                {t(`reports.period_${preset}`)}
              </Text>
            </PressableOpacity>
          );
        })}
      </ScrollView>

      {customOpen ? (
        <View className="flex-row items-center gap-2 px-4 mt-2">
          <View className="flex-1">
            <DatePickerInput
              value={value.fromDate}
              maxDate={value.toDate}
              triggerStyle="chip"
              onChange={(from) => onChange({ preset: "custom", fromDate: from, toDate: value.toDate })}
            />
          </View>
          <Text className="text-xs text-gray-400">→</Text>
          <View className="flex-1">
            <DatePickerInput
              value={value.toDate}
              minDate={value.fromDate}
              triggerStyle="chip"
              onChange={(to) => onChange({ preset: "custom", fromDate: value.fromDate, toDate: to })}
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
