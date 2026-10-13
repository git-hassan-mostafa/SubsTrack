import type { ReactNode } from "react";
import { AppBottomSheet } from "./AppBottomSheet";

interface BottomSheetScaffoldProps {
  visible: boolean;
  onDismiss: () => void;
  children: ReactNode;
  scrollable?: boolean;
}

// tap-outside popup hugging its content; `scrollable` = fixed 70% for long lists
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
