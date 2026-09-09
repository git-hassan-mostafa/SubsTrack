import { useMemo, type ReactNode } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useBottomSheetGestureHandlers } from "@gorhom/bottom-sheet";
import { SHEET_DRAG_ENABLED } from "./AppBottomSheet";

interface SheetDragAreaProps {
  children: ReactNode;
  className?: string;
  activationDistance?: number;
}

// headers only, never around a scrollable — see docs/ui-patterns.md
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

  if (!SHEET_DRAG_ENABLED) return <View className={className}>{children}</View>;

  return (
    <GestureDetector gesture={gesture}>
      <View className={className}>{children}</View>
    </GestureDetector>
  );
}
