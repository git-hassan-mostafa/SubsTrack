import { createContext, useContext, type ComponentType } from "react";
import { ScrollView, type ScrollViewProps } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";

export const InsideBottomSheetContext = createContext(false);

/**
 * Returns `BottomSheetScrollView` inside a sheet and a plain `ScrollView`
 * elsewhere. Used by bodies that render both inside a sheet and on a standalone
 * screen (e.g. the wallet detail view).
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
