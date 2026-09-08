import { useMemo, type RefObject } from "react";
import { I18nManager } from "react-native";
import { Gesture, type PanGesture } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

type ScrollableRef = RefObject<unknown>;

// RNGH types this as a gesture/ComponentType ref, never a component INSTANCE
// ref, so a ScrollView ref needs the cast — see gotcha #138.
type ExternalGestureRef = Parameters<
  PanGesture["blocksExternalGesture"]
>[number];

interface Options {
  onNext: () => void;
  onPrev: () => void;
  distance?: number;
  maxVertical?: number;
  blockedBy?: ScrollableRef[];
}

const EMPTY_REFS: ScrollableRef[] = [];

// Semantic next/prev flick (RTL-flipped); `blockedBy` refs win it — gotcha #138.
export function useHorizontalSwipe({
  onNext,
  onPrev,
  distance = 50,
  maxVertical = 60,
  blockedBy = EMPTY_REFS,
}: Options) {
  return useMemo(() => {
    const pan = Gesture.Pan()
      .activeOffsetX([-15, 15])
      .failOffsetY([-maxVertical, maxVertical])
      .onEnd((e) => {
        if (Math.abs(e.translationX) < distance) return;
        if (Math.abs(e.translationY) > maxVertical) return;
        const forward = I18nManager.isRTL
          ? e.translationX > 0
          : e.translationX < 0;
        if (forward) runOnJS(onNext)();
        else runOnJS(onPrev)();
      });
    if (blockedBy.length === 0) return pan;
    return pan.blocksExternalGesture(...(blockedBy as ExternalGestureRef[]));
  }, [onNext, onPrev, distance, maxVertical, blockedBy]);
}
