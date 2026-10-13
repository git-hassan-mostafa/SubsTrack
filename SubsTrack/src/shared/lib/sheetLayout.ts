import type { ReactNode } from "react";

export type BottomSheetVariant = "auto" | "full";

// a function child is handed the guarded dismiss — see gotcha #54
export type SheetChildren = ReactNode | ((dismiss: () => void) => ReactNode);

export interface AppBottomSheetProps {
  visible: boolean;
  onDismiss: () => void;
  children: SheetChildren;
  variant?: BottomSheetVariant;
  scrollable?: boolean;
  dirty?: boolean;
  dismissOnBackdropPress?: boolean;
}

const FULL_SHEET_RATIO = 0.92;
const LIST_SHEET_RATIO = 0.7;

// null = the sheet hugs its content
export function sheetHeightRatio(
  variant: BottomSheetVariant,
  scrollable: boolean,
): number | null {
  if (variant === "full") return FULL_SHEET_RATIO;
  return scrollable ? LIST_SHEET_RATIO : null;
}

export function sheetBody(
  children: SheetChildren,
  dismiss: () => void,
): ReactNode {
  return typeof children === "function" ? children(dismiss) : children;
}
