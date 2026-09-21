import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Checkbox } from "@/src/shared/components/Checkbox";
import { Text } from "@/src/shared/components/Text";

interface Props {
  onChange: (hardDelete: boolean) => void;
}

// Unchecked = soft-cancel keeping payments; checked = hard delete, no undo.
export function RemovePlanChoice({ onChange }: Props) {
  const { t } = useTranslation();
  const [checked, setChecked] = useState(false);

  function toggle() {
    const next = !checked;
    setChecked(next);
    onChange(next);
  }

  return (
    <PressableOpacity
      onPress={toggle}
      className="flex-row items-start rounded-xl border border-red-200 bg-red-50 p-3"
    >
      <Checkbox checked={checked} size={22} tone="danger" />
      <View className="flex-1 ms-3">
        <Text fontWeight="SemiBold" className="text-sm text-red-600">
          {t("subscriptions.delete_permanently_label")}
        </Text>
        <Text className="text-xs text-red-500 mt-0.5">
          {t("subscriptions.delete_permanently_hint")}
        </Text>
      </View>
    </PressableOpacity>
  );
}
