import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { Checkbox } from "@/src/shared/components/Checkbox";
import { Text } from "@/src/shared/components/Text";

interface Props {
  // Reports whether "delete permanently" is checked. The remove-plan flow reads
  // the latest value through a closure ref after the confirm dialog resolves.
  onChange: (hardDelete: boolean) => void;
}

// The "delete permanently" checkbox shown inside the remove-plan confirm dialog.
// Unchecked (default) = soft-cancel the line, keeping its payments. Checked =
// permanently delete the line and all its payments (cannot be undone). Owns its
// own state; the dialog only resolves to a boolean (confirm / cancel).
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
      className="flex-row items-start rounded-xl border border-gray-200 bg-gray-50 p-3"
    >
      <Checkbox checked={checked} size={22} />
      <View className="flex-1 ms-3">
        <Text fontWeight="SemiBold" className="text-sm text-gray-900">
          {t("subscriptions.delete_permanently_label")}
        </Text>
        <Text className="text-xs text-gray-500 mt-0.5">
          {t("subscriptions.delete_permanently_hint")}
        </Text>
      </View>
    </PressableOpacity>
  );
}
