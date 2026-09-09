import { useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  Keyboard,
  Platform,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { Easing, type WithTimingConfig } from "react-native-reanimated";
import {
  useSafeAreaFrame,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { InsideBottomSheetContext } from "./bottomSheetInputContext";
import { SheetDismissContext } from "./sheetDismissContext";
import { useAndroidBackDismiss } from "@/src/shared/hooks/useAndroidBackDismiss";
import { useUnsavedChangesGuard } from "@/src/shared/hooks/useUnsavedChangesGuard";
import { COLORS } from "@/src/shared/constants";

export type BottomSheetVariant = "auto" | "full";

interface AppBottomSheetProps {
  visible: boolean;
  onDismiss: () => void;
  children: ReactNode;
  variant?: BottomSheetVariant;
  scrollable?: boolean;
  dirty?: boolean;
}

const LIST_SNAP_RATIO = 0.7;

const WEB_MAX_WIDTH = 768;
const FULL_SNAP = ["92%"];

const ANIMATION_CONFIGS: WithTimingConfig | undefined =
  Platform.OS === "android"
    ? { duration: 180, easing: Easing.out(Easing.cubic) }
    : undefined;

// the app's only bottom sheet — see gotchas #44 / #45 / #47
export function AppBottomSheet({
  visible,
  onDismiss,
  children,
  variant = "auto",
  scrollable = false,
  dirty = false,
}: AppBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { height: frameHeight } = useSafeAreaFrame();
  const ref = useRef<BottomSheetModal>(null);

  const openRef = useRef(false);

  const unmountingRef = useRef(false);
  useEffect(
    () => () => {
      unmountingRef.current = true;
    },
    [],
  );

  const handleChange = useCallback((index: number) => {
    openRef.current = index >= 0;
  }, []);

  const reopen = useCallback(() => {
    if (!openRef.current) ref.current?.present();
    else ref.current?.expand();
  }, []);

  const [guardedDismiss, asking] = useUnsavedChangesGuard(
    dirty,
    onDismiss,
    reopen,
  );

  useAndroidBackDismiss(visible && !asking, guardedDismiss);

  useEffect(() => {
    if (visible && !openRef.current) {
      Keyboard.dismiss();
      ref.current?.present();
    } else if (!visible && openRef.current) {
      ref.current?.dismiss();
    }
  }, [visible]);

  const handleAnimate = useCallback(
    (_fromIndex: number, toIndex: number) => {
      if (toIndex !== -1 || !dirty || !visible || asking) return;
      if (unmountingRef.current) return;
      ref.current?.expand();
      guardedDismiss();
    },
    [dirty, visible, asking, guardedDismiss],
  );

  const handleDismiss = useCallback(() => {
    openRef.current = false;
    if (asking || unmountingRef.current) return;
    if (visible) guardedDismiss();
  }, [asking, guardedDismiss, visible]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior={dirty ? 0 : "close"}
        onPress={dirty ? guardedDismiss : undefined}
      />
    ),
    [dirty, guardedDismiss],
  );

  const containerStyle: ViewStyle | undefined =
    Platform.OS === "web" && screenWidth > WEB_MAX_WIDTH
      ? { width: WEB_MAX_WIDTH, marginHorizontal: "auto" }
      : undefined;

  const useFixedSnap = variant === "full" || scrollable;
  const snapPoints = useFixedSnap
    ? variant === "full"
      ? FULL_SNAP
      : [Math.round(frameHeight * LIST_SNAP_RATIO)]
    : undefined;

  return (
    <BottomSheetModal
      ref={ref}
      containerStyle={containerStyle}
      onChange={handleChange}
      onAnimate={handleAnimate}
      onDismiss={handleDismiss}
      stackBehavior="push"
      enablePanDownToClose
      animationConfigs={ANIMATION_CONFIGS}
      enableDynamicSizing={!useFixedSnap}
      maxDynamicContentSize={!useFixedSnap ? frameHeight * 0.9 : undefined}
      snapPoints={snapPoints}
      enableContentPanningGesture={false}
      backdropComponent={renderBackdrop}
      keyboardBehavior={Platform.OS === "web" ? "extend" : "interactive"}
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustPan"
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <InsideBottomSheetContext.Provider value={true}>
        <SheetDismissContext.Provider value={guardedDismiss}>
          {useFixedSnap ? (
            <View
              style={{
                flex: 1,
                paddingBottom: variant === "full" ? 0 : insets.bottom,
              }}
            >
              {children}
            </View>
          ) : (
            <BottomSheetView style={{ paddingBottom: insets.bottom }}>
              {children}
            </BottomSheetView>
          )}
        </SheetDismissContext.Provider>
      </InsideBottomSheetContext.Provider>
    </BottomSheetModal>
  );
}

const styles = {
  background: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handleIndicator: {
    backgroundColor: COLORS.gray300,
    width: 40,
  },
} as const;
