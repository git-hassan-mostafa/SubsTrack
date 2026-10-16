import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Input } from "@/src/shared/components/Input";
import { Text } from "@/src/shared/components/Text";
import { amountText, decimalDigitsOnly, parseAmount } from "@shared/core/utils/inputText";

interface Props {
  meterNumber: string;
  startReading: number | null;
  startReadingLocked: boolean;
  disabled: boolean;
  onMeterNumberChange: (meterNumber: string) => void;
  onStartReadingChange: (startReading: number | null) => void;
}

export function PlanLineMeterFields({
  meterNumber,
  startReading,
  startReadingLocked,
  disabled,
  onMeterNumberChange,
  onStartReadingChange,
}: Props) {
  const { t } = useTranslation();
  const note = startReadingLocked
    ? t("subscriptions.start_reading_locked")
    : startReading === null && !disabled
      ? t("subscriptions.start_reading_hint")
      : null;

  return (
    <View className="mt-3">
      <View className={`flex-row gap-2 ${note ? "" : "-mb-4"}`}>
        <View className="flex-1">
          <Input
            label={t("subscriptions.meter_number_label")}
            value={meterNumber}
            onChangeText={onMeterNumberChange}
            placeholder={t("subscriptions.meter_number_placeholder")}
            editable={!disabled}
          />
        </View>
        <View className="flex-1">
          <Input
            label={t("subscriptions.start_reading_label")}
            value={amountText(startReading)}
            onChangeText={(text) => onStartReadingChange(parseAmount(text))}
            sanitize={decimalDigitsOnly}
            expectedEcho={(next) => amountText(parseAmount(next))}
            placeholder={t("subscriptions.start_reading_placeholder")}
            keyboardType="decimal-pad"
            editable={!disabled && !startReadingLocked}
          />
        </View>
      </View>
      {note ? <Text className="text-xs text-gray-400 -mt-3">{note}</Text> : null}
    </View>
  );
}
