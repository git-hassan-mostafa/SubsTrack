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

/**
 * True while the subtree is rendered inside a Gorhom bottom sheet
 * ({@link AppBottomSheet} provides `true`). Text inputs read this to decide
 * whether they must be Gorhom's `BottomSheetTextInput` — which is what lets the
 * sheet keep the focused field above the keyboard and stops the sheet's pan
 * gesture from stealing the tap. `BottomSheetTextInput` calls
 * `useBottomSheetInternal()` internally, so it MUST NOT be rendered outside a
 * sheet — hence the plain-`TextInput` fallback.
 */
export const InsideBottomSheetContext = createContext(false);

/**
 * Returns the correct `TextInput` component for the current context:
 * `BottomSheetTextInput` inside a sheet, plain `TextInput` everywhere else.
 * Shared primitives (`Input`, `CurrencyInput`) call this so no call site has to
 * know whether it happens to be rendered inside a sheet.
 *
 * Native only: `BottomSheetTextInput` (built on gesture-handler's `TextInput`)
 * is what keeps the focused field above the keyboard and cooperates with the
 * pan-to-close gesture. On web there is no pan gesture and gesture-handler's
 * `TextInput` drops the NativeWind `className` border styling, so we always use
 * the plain RN `TextInput` there — the outline is preserved and nothing is lost.
 */
export function useSheetTextInput(): ComponentType<TextInputProps> {
  const insideSheet = useContext(InsideBottomSheetContext);
  return insideSheet && Platform.OS !== "web"
    ? (BottomSheetTextInput as unknown as ComponentType<TextInputProps>)
    : TextInput;
}

/**
 * Vertical-scroll counterpart of {@link useSheetTextInput}: returns
 * `BottomSheetScrollView` inside a sheet (so its scroll cooperates with the
 * sheet's pan-to-close) and a plain `ScrollView` elsewhere. Used by bodies that
 * render both inside a sheet and on a standalone screen (e.g. the wallet detail
 * view). Horizontal scrollers don't conflict with the vertical pan and can stay
 * plain `ScrollView`s.
 */
export function useSheetScrollView(): ComponentType<ScrollViewProps> {
  const insideSheet = useContext(InsideBottomSheetContext);
  return insideSheet
    ? (BottomSheetScrollView as unknown as ComponentType<ScrollViewProps>)
    : ScrollView;
}
