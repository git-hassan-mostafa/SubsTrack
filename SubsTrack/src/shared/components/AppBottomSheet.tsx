import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, useWindowDimensions } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  Host,
  ModalBottomSheet,
  RNHostView,
  type ModalBottomSheetRef,
} from "@expo/ui/jetpack-compose";
import { fillMaxHeight } from "@expo/ui/jetpack-compose/modifiers";
import { useUnsavedChangesGuard } from "@shared/shared/hooks/useUnsavedChangesGuard";
import { COLORS } from "@/src/shared/constants";
import {
  sheetBody,
  sheetHeightRatio,
  type AppBottomSheetProps,
} from "@/src/shared/lib/sheetLayout";
import { SheetContextReset } from "./SheetContextReset";

function ignore() {}

// the app's only bottom sheet, Material 3 on Android — see gotcha #45
export function AppBottomSheet({
  visible,
  onDismiss,
  children,
  variant = "auto",
  scrollable = false,
  dirty = false,
  dismissOnBackdropPress = true,
}: AppBottomSheetProps) {
  const { width } = useWindowDimensions();
  const sheetRef = useRef<ModalBottomSheetRef>(null);
  const visibleRef = useRef(visible);
  const hiddenByUserRef = useRef(false);
  const [mounted, setMounted] = useState(visible);
  const [lastVisible, setLastVisible] = useState(visible);

  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) setMounted(true);
  }

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    if (mounted) Keyboard.dismiss();
  }, [mounted]);

  useEffect(() => {
    if (visible || !mounted) return;
    Keyboard.dismiss();
    const settle = () => {
      if (visibleRef.current) sheetRef.current?.expand().catch(ignore);
      else setMounted(false);
    };
    (sheetRef.current?.hide() ?? Promise.resolve()).then(settle, settle);
  }, [visible, mounted]);

  const keepOpen = useCallback(() => {
    hiddenByUserRef.current = false;
    sheetRef.current?.expand().catch(ignore);
  }, []);

  const close = useCallback(() => {
    if (hiddenByUserRef.current) {
      hiddenByUserRef.current = false;
      setMounted(false);
    }
    onDismiss();
  }, [onDismiss]);

  const [guardedDismiss, asking] = useUnsavedChangesGuard(
    dirty,
    close,
    keepOpen,
  );

  const handleDismissRequest = useCallback(() => {
    if (!visible || asking) return;
    hiddenByUserRef.current = true;
    Keyboard.dismiss();
    guardedDismiss();
  }, [visible, asking, guardedDismiss]);

  if (!mounted) return null;

  const ratio = sheetHeightRatio(variant, scrollable);
  const body = (
    <SheetContextReset>{sheetBody(children, guardedDismiss)}</SheetContextReset>
  );

  return (
    <Host
      colorScheme="light"
      style={{ position: "absolute", width }}
      pointerEvents="none"
    >
      <ModalBottomSheet
        ref={sheetRef}
        onDismissRequest={handleDismissRequest}
        skipPartiallyExpanded
        containerColor={COLORS.white}
        properties={{
          shouldDismissOnBackPress: true,
          shouldDismissOnClickOutside: dismissOnBackdropPress,
        }}
      >
        {ratio === null ? (
          <RNHostView matchContents={{ vertical: true }}>
            <GestureHandlerRootView style={styles.hug}>
              {body}
            </GestureHandlerRootView>
          </RNHostView>
        ) : (
          <RNHostView modifiers={[fillMaxHeight(ratio)]}>
            <GestureHandlerRootView style={styles.fill}>
              {body}
            </GestureHandlerRootView>
          </RNHostView>
        )}
      </ModalBottomSheet>
    </Host>
  );
}

const styles = {
  hug: { alignSelf: "stretch" },
  fill: { flex: 1 },
} as const;
