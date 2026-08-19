import { createContext, useContext } from "react";

/**
 * Scrolls the enclosing sheet's body to a content offset, published by
 * {@link FormSheet}. For the case where a tap far down the body changes
 * something far UP it — the "Edit entry" action in a stock sheet's history list,
 * which fills the form and shows a banner above it — so what the tap did isn't
 * left off-screen. Pass `0` for the top of the body.
 *
 * A no-op outside a `FormSheet`, since scrolling is presentation only: a caller
 * never has to branch on where it is rendered.
 */
export const SheetScrollContext = createContext<
  ((y: number) => void) | undefined
>(undefined);

const noop = () => {};

export function useSheetScrollTo(): (y: number) => void {
  return useContext(SheetScrollContext) ?? noop;
}
