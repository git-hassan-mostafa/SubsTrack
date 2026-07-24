import { useRef } from "react";
import { cssInterop } from "nativewind";
import { Pressable, type PressableProps } from "react-native";
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
  // Guards against an Android quirk: when `onLongPress` is dropped mid-gesture
  // (e.g. a long press flips the screen into selection mode, removing the
  // handler) the touchable forgets a long press occurred and fires `onPress` on
  // release — undoing what the long press just did. We flag the long press and
  // swallow that trailing `onPress`. The flag resets at the start of the next
  // touch, so a later genuine tap is never lost (and web, which never sends the
  // trailing press, is unaffected).
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
