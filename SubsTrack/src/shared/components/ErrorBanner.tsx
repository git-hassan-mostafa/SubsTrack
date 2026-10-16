import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { IconButton } from "./IconButton";

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  const { t } = useTranslation();
  return (
    <View
      className={`bg-red-50 rounded-xl ps-4 ${onDismiss ? "pe-1" : "pe-4"} py-2 mb-4 flex-row items-center min-h-12`}
    >
      <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
      <Text className="text-red-700 text-sm flex-1 ms-3 py-1">{message}</Text>
      {onDismiss ? (
        <IconButton
          icon="close"
          size={20}
          color={COLORS.danger}
          onPress={onDismiss}
          accessibilityLabel={t("common.close")}
        />
      ) : null}
    </View>
  );
}
