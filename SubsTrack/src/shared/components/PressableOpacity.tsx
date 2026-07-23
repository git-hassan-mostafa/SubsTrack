import { useRef } from "react";
import { cssInterop } from "nativewind";
// Use gesture-handler's TouchableOpacity — NOT react-native's. RN's Touchable
// uses the JS responder system, which fights react-native-gesture-handler (what
// Gorhom's bottom sheets drag with). After a drag-down-to-close, the gesture
// system stays "hot" for one touch and terminates the next tap on an RN
// Touchable (press-in shows, but onPress never fires — the "tap twice" bug).
// gesture-handler's Touchable shares that gesture system, so the first tap works.
import {
  TouchableOpacity,
  type TouchableOpacityProps,
} from "react-native-gesture-handler";

// NativeWind auto-registers RN's core components (incl. RN's TouchableOpacity)
// for `className`→`style`, but NOT gesture-handler's TouchableOpacity. Without
// this the class names silently drop at runtime and every card/button loses its
// chrome (bg / border / radius / padding). Registering it maps `className` onto
// its `style` prop, matching RN's TouchableOpacity behaviour.
cssInterop(TouchableOpacity, { className: "style" });

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

  const handlePressIn = () => {
    longPressed.current = false;
    onPressIn?.();
  };

  const handleLongPress = onLongPress
    ? () => {
        longPressed.current = true;
        onLongPress();
      }
    : undefined;

  const handlePress = onPress
    ? () => {
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        onPress();
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
