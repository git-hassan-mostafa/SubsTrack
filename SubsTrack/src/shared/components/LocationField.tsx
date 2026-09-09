import { useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { Input } from "@/src/shared/components/Input";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { LocationHelpModal } from "@/src/shared/components/LocationHelpModal";
import { COLORS } from "@/src/shared/constants";

interface Props {
  value: string;
  onChange: (next: string) => void;
}

export function LocationField({ value, onChange }: Props) {
  const { t } = useTranslation();
  const [helpVisible, setHelpVisible] = useState(false);

  return (
    <>
      <Input
        label={t("customers.location_label")}
        value={value}
        onChangeText={onChange}
        placeholder={t("customers.location_placeholder")}
        autoCapitalize="none"
        keyboardType="url"
        trailing={
          <PressableOpacity
            onPress={() => setHelpVisible(true)}
            className="w-12 h-12 rounded-xl border border-gray-200 bg-white items-center justify-center"
          >
            <Ionicons
              name="information-circle-outline"
              size={22}
              color={COLORS.primary}
            />
          </PressableOpacity>
        }
      />
      {value.trim() ? (
        <View className="flex-row items-center justify-between -mt-3 mb-4 px-1">
          <View className="flex-row items-center gap-1.5">
            <Ionicons
              name="checkmark-circle"
              size={14}
              color={COLORS.success}
            />
            <Text className="text-xs" style={{ color: COLORS.success }}>
              {t("customers.location_saved")}
            </Text>
          </View>
          <PressableOpacity onPress={() => onChange("")}>
            <Text className="text-xs text-gray-400">{t("common.clear")}</Text>
          </PressableOpacity>
        </View>
      ) : null}
      <LocationHelpModal
        visible={helpVisible}
        onClose={() => setHelpVisible(false)}
      />
    </>
  );
}
