import { useCallback } from "react";
import { BackHandler } from "react-native";
import { useFocusEffect } from "expo-router";

// While a selection is open, Android's back button clears it instead of leaving.
export function useSelectionBackHandler(
  active: boolean,
  onExit: () => void,
): void {
  useFocusEffect(
    useCallback(() => {
      if (!active) return;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        onExit();
        return true;
      });
      return () => sub.remove();
    }, [active, onExit]),
  );
}
