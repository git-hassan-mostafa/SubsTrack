import { useEffect } from "react";
import { Keyboard } from "react-native";
import { usePathname } from "expo-router";

// a card tap in a KEYBOARD_SAFE_LIST keeps the keyboard up — gotcha #191
export function useDismissKeyboardOnNavigate() {
  const pathname = usePathname();
  useEffect(() => {
    Keyboard.dismiss();
  }, [pathname]);
}
