import { createContext, useCallback, useContext, useRef } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

const TOP_THRESHOLD = 1;

export const SheetScrollContext = createContext<(enabled: boolean) => void>(
  () => {},
);

export interface SheetScrollHandlers {
  onScrollBeginDrag?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollEndDrag?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onMomentumScrollEnd?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

// disables sheet drag while scrolled down so flings don't close it — gotcha #45
export function useSheetScroll() {
  const setGesturesEnabled = useContext(SheetScrollContext);
  const enabledRef = useRef(true);

  const onScrollBeginDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      if (y <= TOP_THRESHOLD) {
        if (!enabledRef.current) {
          enabledRef.current = true;
          setGesturesEnabled(true);
        }
      } else {
        if (enabledRef.current) {
          enabledRef.current = false;
          setGesturesEnabled(false);
        }
      }
    },
    [setGesturesEnabled],
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      if (y > TOP_THRESHOLD) {
        if (enabledRef.current) {
          enabledRef.current = false;
          setGesturesEnabled(false);
        }
      }
    },
    [setGesturesEnabled],
  );

  const onScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const vy = e.nativeEvent.velocity?.y ?? 0;
      if (y <= TOP_THRESHOLD && vy === 0 && !enabledRef.current) {
        enabledRef.current = true;
        setGesturesEnabled(true);
      }
    },
    [setGesturesEnabled],
  );

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      if (y <= TOP_THRESHOLD && !enabledRef.current) {
        enabledRef.current = true;
        setGesturesEnabled(true);
      }
    },
    [setGesturesEnabled],
  );

  return {
    onScrollBeginDrag,
    onScroll,
    onScrollEndDrag,
    onMomentumScrollEnd,
  };
}

export function useSheetScrollProps(
  inSheet = true,
  caller?: SheetScrollHandlers,
) {
  const sheetScroll = useSheetScroll();
  if (!inSheet) {
    return {
      nestedScrollEnabled: false,
      onScrollBeginDrag: caller?.onScrollBeginDrag,
      onScroll: caller?.onScroll,
      onScrollEndDrag: caller?.onScrollEndDrag,
      onMomentumScrollEnd: caller?.onMomentumScrollEnd,
    };
  }

  return {
    nestedScrollEnabled: true,
    scrollEventThrottle: 16,
    onScrollBeginDrag: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      sheetScroll.onScrollBeginDrag(e);
      caller?.onScrollBeginDrag?.(e);
    },
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      sheetScroll.onScroll(e);
      caller?.onScroll?.(e);
    },
    onScrollEndDrag: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      sheetScroll.onScrollEndDrag(e);
      caller?.onScrollEndDrag?.(e);
    },
    onMomentumScrollEnd: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      sheetScroll.onMomentumScrollEnd(e);
      caller?.onMomentumScrollEnd?.(e);
    },
  };
}
