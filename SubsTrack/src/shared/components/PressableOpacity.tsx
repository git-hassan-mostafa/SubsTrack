import { useRef } from "react";
import { cssInterop } from "nativewind";
// Build on gesture-handler's Pressable — NOT react-native's Touchable/Pressable.
// RN's touchables use the JS "responder" system, a separate world from
// react-native-gesture-handler (what Gorhom's bottom sheets drag with). After a
// sheet is closed by DRAGGING it down, the native gesture system stays "hot" for
// one more touch to settle the just-finished pan; that first tap on an RN
// touchable is granted then terminated — onPressIn fires (you see the press
// effect) but onPress never does, so the tap is eaten and you must tap twice.
// gesture-handler's Pressable lives in the same gesture system, so it isn't
// terminated and the first tap works.
//
// We use `Pressable` (a SINGLE styled view) and NOT gesture-handler's
// `TouchableOpacity`, which renders TWO nodes (an outer `containerStyle` view +
// an inner `style` view). With that split, a single `className` can only reach
// one node, so `flex-1` / positioning would land on the wrong one and break
// layouts. Pressable keeps the one-node model of RN's old touchable, so
// `className` behaves identically everywhere — no per-component special-casing.
import {
  Pressable,
  type PressableProps,
} from "react-native-gesture-handler";

// NativeWind auto-registers RN's core components for className→style but NOT
// gesture-handler's, so without this the class names silently drop at runtime.
// This is the exact registration NativeWind itself uses for RN's Pressable; the
// `active:opacity-60` press feedback below rides on it (NativeWind injects the
// press handlers that drive the `active:` state).
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
