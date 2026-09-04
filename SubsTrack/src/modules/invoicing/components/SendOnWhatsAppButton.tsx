import { ActivityIndicator, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";

interface Props {
  phone?: string | null;
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  reason?: string;
  className?: string;
}

// The app's single green WhatsApp action. Matches Button's geometry; it is its
// own component because Button takes no icon and no className.
export function SendOnWhatsAppButton({
  phone,
  label,
  onPress,
  loading,
  disabled,
  reason,
  className,
}: Props) {
  const { t } = useTranslation();
  const noPhone = (phone ?? "").replace(/\D/g, "").length === 0;
  const isDisabled = disabled || loading || noPhone;
  const caption = noPhone ? (reason ?? t("invoice.no_phone")) : null;

  return (
    <View className={className}>
      <PressableOpacity
        onPress={onPress}
        disabled={isDisabled}
        className={`rounded-xl py-3.5 px-6 flex-row items-center justify-center bg-[#25D366] ${isDisabled ? "opacity-40" : ""}`}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.white} size="small" />
        ) : (
          <>
            <Ionicons name="logo-whatsapp" size={18} color={COLORS.white} />
            <Text className="text-base font-semibold text-white ms-2">
              {label}
            </Text>
          </>
        )}
      </PressableOpacity>
      {caption ? (
        <Text className="text-xs text-gray-400 text-center mt-1">{caption}</Text>
      ) : null}
    </View>
  );
}
