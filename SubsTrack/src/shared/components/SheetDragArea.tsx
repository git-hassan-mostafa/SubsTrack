import { useMemo, type ReactNode } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useBottomSheetGestureHandlers } from "@gorhom/bottom-sheet";

interface SheetDragAreaProps {
  children: ReactNode;
  className?: string;
  activationDistance?: number;
}

/**
 * Turns a strip of sheet CONTENT into a second drag handle: dragging it moves
 * (and pans down to close) the sheet exactly like Gorhom's handle bar does.
 *
 * Why this exists: `AppBottomSheet` disables Gorhom's *content* pan gesture for
 * every variant — it freezes plain RN scrollables and locks Gorhom's own
 * (gotchas #45/#47) — which left the tiny handle bar as the only drag target.
 * This re-attaches the **handle** gesture (`GESTURE_SOURCE.HANDLE`, the same one
 * `BottomSheetHandleContainer` uses) to a region we know holds no scrollable, so
 * nothing can be stolen from a list. Use it on sheet HEADERS only.
 *
 * A pan only activates on movement, so taps on buttons inside still fire.
 * Must be rendered inside a sheet — the hook throws outside one.
 *
 * **Never wrap a scrollable in it.** The handle gesture ignores the list's
 * scroll offset (only Gorhom's CONTENT source reads it), so it would both
 * swallow the scroll and drag the sheet from the middle of a list. A body with
 * NO scrollable (`ActionMenu`'s rows) is fine — pass `activationDistance` there.
 */
export function SheetDragArea({
  children,
  className,
  activationDistance,
}: SheetDragAreaProps) {
  const { handlePanGestureHandler } = useBottomSheetGestureHandlers();

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .shouldCancelWhenOutside(false)
      .runOnJS(false)
      .onStart(handlePanGestureHandler.handleOnStart)
      .onChange(handlePanGestureHandler.handleOnChange)
      .onEnd(handlePanGestureHandler.handleOnEnd)
      .onFinalize(handlePanGestureHandler.handleOnFinalize);
    return activationDistance
      ? pan.activeOffsetY([-activationDistance, activationDistance])
      : pan;
  }, [
    activationDistance,
    handlePanGestureHandler.handleOnStart,
    handlePanGestureHandler.handleOnChange,
    handlePanGestureHandler.handleOnEnd,
    handlePanGestureHandler.handleOnFinalize,
  ]);

  return (
    <GestureDetector gesture={gesture}>
      <View className={className}>{children}</View>
    </GestureDetector>
  );
}
