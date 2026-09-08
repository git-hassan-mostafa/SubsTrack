import { createContext, useContext, type ComponentType } from "react";
import {
  Platform,
  ScrollView,
  TextInput,
  type ScrollViewProps,
  type TextInputProps,
} from "react-native";
import {
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { TextInput as GestureTextInput } from "react-native-gesture-handler";

export const InsideBottomSheetContext = createContext(false);

/** On NATIVE every field is a gesture-handler input — see gotcha #78. */
export function useSheetTextInput(): ComponentType<TextInputProps> {
  const insideSheet = useContext(InsideBottomSheetContext);
  if (Platform.OS === "web") return TextInput;
  return insideSheet
    ? (BottomSheetTextInput as unknown as ComponentType<TextInputProps>)
    : (GestureTextInput as unknown as ComponentType<TextInputProps>);
}

/**
 * Vertical-scroll counterpart of {@link useSheetTextInput}: returns
 * `BottomSheetScrollView` inside a sheet and a plain `ScrollView` elsewhere.
 * Used by bodies that render both inside a sheet and on a standalone screen
 * (e.g. the wallet detail view).
 *
 * Only for FIXED-height sheets (`FormSheet` / `variant="full"`). A
 * content-sized (`auto`) sheet must use plain scrollables — a Gorhom one
 * overwrites the sheet's measured content height (gotcha #47).
 */
export function useSheetScrollView(): ComponentType<ScrollViewProps> {
  const insideSheet = useContext(InsideBottomSheetContext);
  return insideSheet
    ? (BottomSheetScrollView as unknown as ComponentType<ScrollViewProps>)
    : ScrollView;
}
