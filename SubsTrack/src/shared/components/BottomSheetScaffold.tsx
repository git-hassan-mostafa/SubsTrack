import type { ReactNode } from "react";
import { AppBottomSheet } from "./AppBottomSheet";

interface BottomSheetScaffoldProps {
  visible: boolean;
  onDismiss: () => void;
  children: ReactNode;
  /**
   * Pass `true` when the body contains a virtualized list
   * (`BottomSheetFlatList`) — the sheet then opens at a fixed height and the
   * list fills it (no empty gap under a long list). Give the list `flex:1`
   * instead of a `maxHeight`. Small/non-list popups (e.g. `ActionMenu`) omit it
   * and hug their content.
   */
  scrollable?: boolean;
}

/**
 * Content-height bottom sheet for transient tap-outside popups — dropdowns,
 * date / currency / entity pickers, action menus. A thin wrapper over
 * {@link AppBottomSheet} (`variant="auto"`): the sheet sizes itself to its
 * content, drags down / taps-backdrop / hardware-back to close, and keeps its
 * own keyboard handling (text inputs inside auto-swap to `BottomSheetTextInput`
 * via {@link useSheetTextInput}), so callers no longer need a `wrap` prop.
 *
 * Any scrollable inside MUST be a Gorhom scrollable (`BottomSheetFlatList` /
 * `BottomSheetScrollView`) so its scroll cooperates with the sheet's
 * pan-to-close gesture.
 */
export function BottomSheetScaffold({
  visible,
  onDismiss,
  children,
  scrollable = false,
}: BottomSheetScaffoldProps) {
  return (
    <AppBottomSheet
      visible={visible}
      onDismiss={onDismiss}
      variant="auto"
      scrollable={scrollable}
    >
      {children}
    </AppBottomSheet>
  );
}
