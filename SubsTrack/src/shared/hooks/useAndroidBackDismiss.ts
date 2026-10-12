import { useEffect, useEffectEvent } from "react";
import { BackHandler, Platform } from "react-native";

// Gorhom v5 wires no BackHandler of its own — see gotcha #44
export function useAndroidBackDismiss(active: boolean, onDismiss: () => void) {
  const dismiss = useEffectEvent(onDismiss);

  useEffect(() => {
    if (Platform.OS !== "android" || !active) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      dismiss();
      return true;
    });
    return () => sub.remove();
  }, [active]);
}
