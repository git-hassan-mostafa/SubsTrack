import { useEffect, useRef } from "react";
import { BackHandler, Platform } from "react-native";

// Gorhom v5 wires no BackHandler of its own — see gotcha #44
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
