import { createContext, useContext } from "react";

export const SheetDismissContext = createContext<(() => void) | undefined>(
  undefined,
);

export function useSheetDismiss(fallback: () => void): () => void {
  return useContext(SheetDismissContext) ?? fallback;
}
