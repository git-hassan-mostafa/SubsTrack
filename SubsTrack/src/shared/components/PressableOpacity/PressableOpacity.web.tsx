import { useRef } from "react";
import { cssInterop } from "nativewind";
import { Pressable, type PressableProps } from "react-native-gesture-handler";
cssInterop(Pressable, { className: "style" });

type PressEvent = Parameters<NonNullable<PressableProps["onPress"]>>[0];

type PressableOpacityProps = PressableProps;

export function PressableOpacity({
  onPress,
  onLongPress,
  onPressIn,
  className,
  ...props
}: PressableOpacityProps) {
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
