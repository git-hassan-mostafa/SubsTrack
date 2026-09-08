import { useCallback, useMemo, type RefObject } from "react";
import type { Segment } from "@/src/shared/components/SegmentedTabs";
import { useHorizontalSwipe } from "./useHorizontalSwipe";

interface Options<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void | Promise<void>;
  blockedBy?: RefObject<unknown>[];
}

// Adds flick-to-step to an existing tab switcher. Takes the tab value + setter
// rather than owning them, so the caller may keep them in a store — gotcha #139.
export function useSwipeableTabs<T extends string>({
  segments,
  value,
  onChange,
  blockedBy,
}: Options<T>) {
  const select = useCallback(
    (next: T) => {
      void onChange(next);
    },
    [onChange],
  );

  const step = useCallback(
    (delta: number) => {
      const next = segments.findIndex((s) => s.key === value) + delta;
      if (next < 0 || next >= segments.length) return;
      select(segments[next].key);
    },
    [segments, value, select],
  );

  const onNext = useCallback(() => step(1), [step]);
  const onPrev = useCallback(() => step(-1), [step]);
  const swipe = useHorizontalSwipe({ onNext, onPrev, blockedBy });

  return useMemo(
    () => ({ swipe, tabsProps: { value, onChange: select, segments } }),
    [swipe, value, select, segments],
  );
}
