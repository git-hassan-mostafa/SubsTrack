import { useRef } from "react";
import { Pressable, View, type PressableProps } from "react-native";
import { COLORS } from "@/src/shared/constants";

type PressEvent = Parameters<NonNullable<PressableProps["onPress"]>>[0];

export type RippleKind = "bounded" | "borderless" | "none";

interface Props extends PressableProps {
  ripple?: RippleKind;
  rippleColor?: string;
  containerClassName?: string;
}

const BORDERLESS_RADIUS = 24;

// stray-press guard + why rounded shapes need containerClassName — see gotcha #46
export function PressableOpacity({
  onPress,
  onLongPress,
  onPressIn,
  ripple = "bounded",
  rippleColor = COLORS.ripple,
  containerClassName,
  ...props
}: Props) {
  const longPressed = useRef(false);

  const handlePressIn = (e: PressEvent) => {
    longPressed.current = false;
    onPressIn?.(e);
  };

  const handleLongPress = onLongPress
    ? (e: PressEvent) => {
        longPressed.current = true;
        onLongPress(e);
      }
    : undefined;

  const handlePress = onPress
    ? (e: PressEvent) => {
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        onPress(e);
      }
    : undefined;

  const androidRipple =
    ripple === "none"
      ? undefined
      : {
          color: rippleColor,
          borderless: ripple === "borderless",
          radius: ripple === "borderless" ? BORDERLESS_RADIUS : undefined,
          foreground: true,
        };

  const pressable = (
    <Pressable
      {...props}
      android_ripple={androidRipple}
      onPressIn={handlePressIn}
      onPress={handlePress}
      onLongPress={handleLongPress}
    />
  );

  if (!containerClassName) return pressable;

  return (
    <View className={`overflow-hidden ${containerClassName}`}>{pressable}</View>
  );
}
