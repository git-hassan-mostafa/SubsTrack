import { Modal, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { COLORS } from "@/src/shared/constants";
import { openMapsApp } from "@/src/shared/lib/maps";

interface Props {
  visible: boolean;
  onClose: () => void;
}

const STEPS = [1, 2, 3, 4];

// Keeps the "how to copy a map link" steps out of the form they belong to.
export function LocationHelpModal({ visible, onClose }: Props) {
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/50 items-center justify-center px-8">
        <View className="bg-white rounded-2xl p-6 w-full max-w-sm">
          <Text fontWeight="SemiBold" className="text-lg text-gray-900 mb-4">
            {t("customers.location_help_title")}
          </Text>
          <View className="gap-3 mb-5">
            {STEPS.map((n) => (
              <View key={n} className="flex-row items-start gap-3">
                <View className="w-6 h-6 rounded-full bg-gray-100 items-center justify-center">
                  <Text fontWeight="SemiBold" className="text-xs text-gray-600">
                    {n}
                  </Text>
                </View>
                <Text className="flex-1 text-sm text-gray-600 leading-5">
                  {t(`customers.location_step_${n}`)}
                </Text>
              </View>
            ))}
          </View>
          <PressableOpacity
            onPress={() => void openMapsApp()}
            className="flex-row items-center justify-center gap-2 rounded-xl py-3 px-4 bg-primary mb-3"
          >
            <Ionicons name="map-outline" size={18} color={COLORS.white} />
            <Text fontWeight="SemiBold" className="text-sm text-white">
              {t("customers.location_open_maps")}
            </Text>
          </PressableOpacity>
          <PressableOpacity
            onPress={onClose}
            className="border border-gray-300 rounded-xl py-3 items-center"
          >
            <Text fontWeight="Medium" className="text-gray-700">
              {t("common.close")}
            </Text>
          </PressableOpacity>
        </View>
      </View>
    </Modal>
  );
}
