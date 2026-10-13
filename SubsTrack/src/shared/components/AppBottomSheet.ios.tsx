import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, View, useWindowDimensions } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import {
  interactiveDismissDisabled,
  presentationBackground,
  presentationDetents,
  presentationDragIndicator,
  presentationSizing,
} from "@expo/ui/swift-ui/modifiers";
import { useUnsavedChangesGuard } from "@shared/shared/hooks/useUnsavedChangesGuard";
import { COLORS } from "@/src/shared/constants";
import {
  sheetBody,
  sheetHeightRatio,
  type AppBottomSheetProps,
} from "@/src/shared/lib/sheetLayout";
import { SheetContextReset } from "./SheetContextReset";

// SwiftUI on iOS; a dirty sheet can't be swiped away, only closed by its header
export function AppBottomSheet({
  visible,
  onDismiss,
  children,
  variant = "auto",
  scrollable = false,
  dirty = false,
}: AppBottomSheetProps) {
  const { width } = useWindowDimensions();
  const presentedRef = useRef(visible);
  const [presented, setPresented] = useState(visible);
  const [lastVisible, setLastVisible] = useState(visible);

  if (visible !== lastVisible) {
    setLastVisible(visible);
    setPresented(visible);
  }

  useEffect(() => {
    presentedRef.current = presented;
    if (presented) Keyboard.dismiss();
  }, [presented]);

  const close = useCallback(() => {
    presentedRef.current = false;
    setPresented(false);
    onDismiss();
  }, [onDismiss]);

  const [guardedDismiss] = useUnsavedChangesGuard(dirty, close);

  const handlePresentedChange = useCallback(
    (isPresented: boolean) => {
      if (isPresented || !presentedRef.current) return;
      close();
    },
    [close],
  );

  const ratio = sheetHeightRatio(variant, scrollable);
  const modifiers = [
    ratio === null
      ? presentationSizing("automatic", {
          fitted: { horizontal: false, vertical: true },
        })
      : presentationDetents([{ fraction: ratio }]),
    presentationDragIndicator("visible"),
    interactiveDismissDisabled(dirty),
    presentationBackground(COLORS.white),
  ];

  return (
    <Host
      colorScheme="light"
      style={{ position: "absolute", width }}
      pointerEvents="none"
    >
      <BottomSheet
        isPresented={presented}
        onIsPresentedChange={handlePresentedChange}
        fitToContents={ratio === null}
      >
        <Group modifiers={modifiers}>
          <RNHostView matchContents={ratio === null ? { vertical: true } : false}>
            <View style={ratio === null ? styles.fitted : styles.filled}>
              <SheetContextReset>
                <GestureHandlerRootView
                  style={ratio === null ? styles.hug : styles.fill}
                >
                  {sheetBody(children, guardedDismiss)}
                </GestureHandlerRootView>
              </SheetContextReset>
            </View>
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  );
}

const styles = {
  fitted: { paddingTop: 16 },
  filled: { flexGrow: 1, height: 0, paddingTop: 16 },
  hug: { alignSelf: "stretch" },
  fill: { flex: 1 },
} as const;
