import type { ReactNode } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { Avatar } from "@/src/shared/components/Avatar";
import { IconButton } from "@/src/shared/components/IconButton";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { COLORS } from "@/src/shared/constants";

interface Props {
  title?: string;
  subtitle?: string | null;
  subject?: string | null;
  actions?: ReactNode;
  onClose: () => void;
  closeStyle?: "text" | "icon";
}

// one header for every sheet; `subject` leads, the title drops under it
export function SheetHeader({
  title,
  subtitle,
  subject,
  actions,
  onClose,
  closeStyle = "text",
}: Props) {
  const { t } = useTranslation();
  const heading = subject ?? title;
  const caption = subject ? title : subtitle;

  return (
    <View className="flex-row items-center min-h-14 ps-5 pe-2 py-1 border-b border-gray-100">
      <View className="flex-1 me-2 flex-row items-center gap-3">
        {subject ? <Avatar name={subject} /> : null}
        <View className="flex-1">
          {heading ? (
            <Text
              fontWeight="SemiBold"
              numberOfLines={1}
              className="text-lg text-gray-900"
            >
              {heading}
            </Text>
          ) : null}
          {caption ? (
            <Text numberOfLines={1} className="text-sm text-gray-500">
              {caption}
            </Text>
          ) : null}
        </View>
      </View>
      {actions}
      {closeStyle === "icon" ? (
        <IconButton
          icon="close"
          color={COLORS.gray600}
          onPress={onClose}
          accessibilityLabel={t("common.close")}
        />
      ) : (
        <PressableOpacity
          onPress={onClose}
          ripple="borderless"
          accessibilityRole="button"
          className="min-h-12 px-3 items-center justify-center"
        >
          <Text fontWeight="SemiBold" className="text-base text-primary">
            {t("common.close")}
          </Text>
        </PressableOpacity>
      )}
    </View>
  );
}
