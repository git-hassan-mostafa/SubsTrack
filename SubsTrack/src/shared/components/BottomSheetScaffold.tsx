import type { ReactNode } from "react";
import { AppBottomSheet } from "./AppBottomSheet";

interface BottomSheetScaffoldProps {
  visible: boolean;
  onDismiss: () => void;
  children: ReactNode;
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
 * Without `scrollable` the sheet is sized to its content, so the body must use
 * PLAIN RN scrollables (`FlatList` / `ScrollView`) — a Gorhom scrollable
 * overwrites that measurement with its own scroll-content height and the sheet
 * comes out too short (last rows clipped) or too tall. Cap such a list with
 * `maxHeight`. With `scrollable` the fixed snap turns dynamic sizing off, so
 * either kind works — see gotchas #45 / #47.
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
