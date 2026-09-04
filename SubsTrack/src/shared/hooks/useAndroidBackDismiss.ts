import { useEffect, useRef } from "react";
import { BackHandler, Platform } from "react-native";

/**
 * Android hardware-back closes the top-most open sheet instead of navigating.
 *
 * Gorhom (v5) ships **no** `BackHandler` integration — neither `BottomSheetModal`
 * nor `BottomSheetModalProvider` touches the hardware back button — and its
 * sheets are not RN `Modal`s, so nothing routes back through `onRequestClose`
 * either. Without this hook Back falls through to Expo Router and pops the
 * route while the sheet stays open.
 *
 * Native counterpart of {@link useWebBackDismiss} (which covers browser Back on
 * web). No-op on iOS/web.
 *
 * Stacking: RN fires `hardwareBackPress` listeners newest-first, so a sheet
 * opened on top of another — or a selection bar activated inside one
 * ({@link useSelectionBackHandler}) — is dismissed before whatever sits under
 * it, without any shared stack bookkeeping.
 */
export function useAndroidBackDismiss(active: boolean, onDismiss: () => void) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (Platform.OS !== "android" || !active) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onDismissRef.current();
      return true;
    });
    return () => sub.remove();
  }, [active]);
}
