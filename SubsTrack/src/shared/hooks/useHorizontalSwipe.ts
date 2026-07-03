import { useMemo } from "react";
import { I18nManager } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

interface Options {
  /** Called when the user swipes toward the "next" item. */
  onNext: () => void;
  /** Called when the user swipes toward the "previous" item. */
  onPrev: () => void;
  /** Min horizontal travel (px) before a swipe counts. Default 50. */
  distance?: number;
  /** Max vertical travel (px) allowed — filters out diagonal / scroll gestures. Default 60. */
  maxVertical?: number;
}

/**
 * A horizontal-swipe pan gesture that maps a finger flick to a semantic
 * next/prev step, correctly for both LTR and RTL.
 *
 * Callbacks are framed by meaning, not physical direction: swiping toward the
 * start of the reading order fires `onPrev`, toward the end fires `onNext`. In
 * LTR a right→left flick is "next"; in RTL it is flipped so the gesture still
 * matches the on-screen forward/back chevrons.
 *
 * Requires the app to be wrapped in `GestureHandlerRootView` (it is, in the
 * root layout). Attach the returned gesture with `<GestureDetector>`.
 */
export function useHorizontalSwipe({
  onNext,
  onPrev,
  distance = 50,
  maxVertical = 60,
}: Options) {
  return useMemo(
    () =>
      Gesture.Pan()
        // Only claim the gesture once it is clearly horizontal, so vertical
        // list scrolling underneath keeps working.
        .activeOffsetX([-15, 15])
        .failOffsetY([-maxVertical, maxVertical])
        .onEnd((e) => {
          if (Math.abs(e.translationX) < distance) return;
          if (Math.abs(e.translationY) > maxVertical) return;
          // translationX < 0 is a physical right→left flick.
          const forward = I18nManager.isRTL
            ? e.translationX > 0
            : e.translationX < 0;
          if (forward) runOnJS(onNext)();
          else runOnJS(onPrev)();
        }),
    [onNext, onPrev, distance, maxVertical],
  );
}
