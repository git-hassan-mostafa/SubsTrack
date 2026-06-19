import { useRef } from "react";
import {
  TouchableOpacity,
  type GestureResponderEvent,
  type TouchableOpacityProps,
} from "react-native";

interface PressableOpacityProps extends TouchableOpacityProps {
  pressedOpacity?: number;
}

export function PressableOpacity({
  pressedOpacity = 0.6,
  onPress,
  onLongPress,
  onPressIn,
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

  const handlePressIn = (e: GestureResponderEvent) => {
    longPressed.current = false;
    onPressIn?.(e);
  };

  const handleLongPress = onLongPress
    ? (e: GestureResponderEvent) => {
        longPressed.current = true;
        onLongPress(e);
      }
    : undefined;

  const handlePress = onPress
    ? (e: GestureResponderEvent) => {
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        onPress(e);
      }
    : undefined;

  return (
    <TouchableOpacity
      activeOpacity={pressedOpacity}
      {...props}
      onPressIn={handlePressIn}
      onPress={handlePress}
      onLongPress={handleLongPress}
    />
  );
}
