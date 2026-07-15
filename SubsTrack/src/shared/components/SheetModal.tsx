import { Modal, type ModalProps } from "react-native";
import type { ReactNode } from "react";
import { useWebBackDismiss } from "@/src/shared/hooks/useWebBackDismiss";

interface SheetModalProps
  extends Omit<ModalProps, "onRequestClose" | "visible" | "children"> {
  /** Defaults to `true` — most sheets are mounted only while open. */
  visible?: boolean;
  /** Called on Cancel, hardware back (native), and browser Back (web). */
  onDismiss: () => void;
  children: ReactNode;
}

/**
 * Shared page-sheet shell. Wraps RN's `Modal` with the app's standard
 * page-sheet chrome (`slide` + `pageSheet`) and wires `onDismiss` to both the
 * native hardware-back (`onRequestClose`) and — via {@link useWebBackDismiss} —
 * the browser Back button on web, so Back closes the sheet instead of changing
 * the route.
 */
export function SheetModal({
  visible = true,
  onDismiss,
  children,
  ...rest
}: SheetModalProps) {
  useWebBackDismiss(visible, onDismiss);
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
      {...rest}
    >
      {children}
    </Modal>
  );
}
