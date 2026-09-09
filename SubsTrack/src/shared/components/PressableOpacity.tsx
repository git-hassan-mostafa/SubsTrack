import { useRef } from "react";
import { Pressable, type PressableProps } from "react-native";

type PressEvent = Parameters<NonNullable<PressableProps["onPress"]>>[0];

// swallows the stray onPress Android fires after a long press — see gotcha #46
export function PressableOpacity({
  onPress,
  onLongPress,
  onPressIn,
  className,
  ...props
}: PressableProps) {
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

  return (
    <Pressable
      {...props}
      className={`active:opacity-60 ${className ?? ""}`}
      onPressIn={handlePressIn}
      onPress={handlePress}
      onLongPress={handleLongPress}
    />
  );
}
