import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { initialsOf } from "@shared/core/utils/initials";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";

export type AvatarSize = 40 | 48 | 56 | 72;

const SIZE_CLASSES: Record<AvatarSize, { box: string; text: string }> = {
  40: { box: "w-10 h-10", text: "text-base" },
  48: { box: "w-12 h-12", text: "text-lg" },
  56: { box: "w-14 h-14", text: "text-xl" },
  72: { box: "w-[72px] h-[72px]", text: "text-2xl" },
};

const ICON_SIZE: Record<AvatarSize, number> = { 40: 20, 48: 24, 56: 28, 72: 34 };

interface Props {
  name: string;
  size?: AvatarSize;
}

// includeFontPadding off, or Cairo's tall line box pushes the letters low (#78)
export function Avatar({ name, size = 40 }: Props) {
  const initials = initialsOf(name);
  const classes = SIZE_CLASSES[size];

  return (
    <View
      className={`${classes.box} rounded-full bg-primary-container items-center justify-center`}
    >
      {initials ? (
        <Text
          fontWeight="SemiBold"
          className={`${classes.text} text-primary-on-container`}
          style={{ includeFontPadding: false }}
          numberOfLines={1}
        >
          {initials}
        </Text>
      ) : (
        <Ionicons
          name="person"
          size={ICON_SIZE[size]}
          color={COLORS.onPrimaryContainer}
        />
      )}
    </View>
  );
}
