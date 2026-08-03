import { createContext, useContext } from "react";

/**
 * The **guarded** dismiss of the enclosing sheet, published by
 * {@link AppBottomSheet}. A sheet's own close affordances (FormSheet's header
 * Cancel, a hand-rolled header's X button) must call THIS rather than the raw
 * `onDismiss` prop, so the unsaved-changes confirmation covers the button too —
 * not only Back and the drag-down gesture.
 *
 * Undefined outside a sheet; `useSheetDismiss` falls back to the caller's own
 * handler so a component works in both contexts.
 */
export const SheetDismissContext = createContext<(() => void) | undefined>(
  undefined,
);

export function useSheetDismiss(fallback: () => void): () => void {
  return useContext(SheetDismissContext) ?? fallback;
}
