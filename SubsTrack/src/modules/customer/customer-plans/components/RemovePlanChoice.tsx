import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  removeLineChoice,
  type CancelDateBounds,
  type RemoveLineChoice,
} from "@shared/modules/customer/customer-plans/utils/cancelDate";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Checkbox } from "@/src/shared/components/Checkbox";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { Text } from "@/src/shared/components/Text";

interface Props {
  bounds: CancelDateBounds;
  onChange: (choice: RemoveLineChoice) => void;
}

// Only a kept line needs a stop day, so a hard delete hides it.
export function RemovePlanChoice({ bounds, onChange }: Props) {
  const { t } = useTranslation();
  const [hardDelete, setHardDelete] = useState(false);
  const [cancelDate, setCancelDate] = useState(bounds.max);

  function update(nextHardDelete: boolean, nextCancelDate: string) {
    setHardDelete(nextHardDelete);
    setCancelDate(nextCancelDate);
    onChange(removeLineChoice(nextHardDelete, nextCancelDate));
  }

  return (
    <View className="gap-3">
      {!hardDelete ? (
        <View>
          <DatePickerInput
            label={t("subscriptions.cancel_date_label")}
            value={cancelDate}
            onChange={(day) => update(false, day)}
            minDate={bounds.min}
            maxDate={bounds.max}
          />
          <Text className="text-xs text-gray-500 mt-1">
            {t("subscriptions.cancel_date_hint")}
          </Text>
        </View>
      ) : null}
      <PressableOpacity
        onPress={() => update(!hardDelete, cancelDate)}
        containerClassName="rounded-xl border border-red-200 bg-red-50" className="flex-row items-start p-3"
      >
        <Checkbox checked={hardDelete} size={22} tone="danger" />
        <View className="flex-1 ms-3">
          <Text fontWeight="SemiBold" className="text-sm text-red-600">
            {t("subscriptions.delete_permanently_label")}
          </Text>
          <Text className="text-xs text-red-500 mt-0.5">
            {t("subscriptions.delete_permanently_hint")}
          </Text>
        </View>
      </PressableOpacity>
    </View>
  );
}
