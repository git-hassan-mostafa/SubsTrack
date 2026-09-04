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
import { useWebBackDismiss } from "@/src/shared/hooks/useWebBackDismiss";
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

/**
 * The single Gorhom bottom-sheet foundation for the whole app. Every popup and
 * form sheet is built on this via {@link BottomSheetScaffold} (`auto`) or
 * {@link FormSheet} (`full`). It replaces the previous hand-rolled Reanimated
 * sheet.
 *
 * Gorhom gives us drag-down-to-close and backdrop-tap-to-close. Back is ours to
 * wire — Gorhom v5 has no `BackHandler` of its own: Android hardware-back goes
 * through {@link useAndroidBackDismiss}, browser Back on web through
 * {@link useWebBackDismiss}. Both cover EVERY variant, so Back never reaches the
 * router while any sheet or popup is open (gotcha #44/#45).
 *
 * Callers stay declarative (`visible` / `onDismiss`); this bridges that to
 * Gorhom's imperative `present()` / `dismiss()` and guards the completion
 * callback so a programmatic close (visible → false) never re-fires `onDismiss`.
 *
 * Unsaved changes: pass `dirty` and EVERY close path (header button, Android
 * back, browser Back, drag-down, backdrop tap) first asks to discard — one seam
 * for all of them, so no form has to wire the prompt itself. The header button
 * gets it by reading `SheetDismissContext` rather than the raw `onDismiss` prop.
 * See {@link useUnsavedChangesGuard} and {@link useDirtyForm}.
 *
 * Sizing: `full` uses a fixed `snapPoints` (92%); `auto` (popups) uses Gorhom's
 * `enableDynamicSizing` to fit its content, capped by `maxDynamicContentSize`.
 * An `auto` body must therefore use PLAIN RN scrollables (`FlatList` /
 * `ScrollView`) — a Gorhom scrollable OVERWRITES the sheet's measured content
 * height with its own scroll-content height, so the sheet ends up shorter than
 * its body (bottom rows clipped) or far taller (empty gap). See gotcha #47.
 * Content panning is off for every variant, which is what lets a plain
 * scrollable scroll inside a sheet.
 *
 * Keyboard: opening any sheet first dismisses the keyboard, so a picker tapped
 * while a field is focused isn't drawn behind it (gotcha #124). A text input
 * INSIDE the sheet still raises it normally.
 *
 * Present/dismiss lifecycle: the `auto` popups are ALWAYS mounted and toggle
 * `visible`. Calling Gorhom's `present()` / `dismiss()` out of sync with the
 * sheet's real state wedges it (the next call silently no-ops). So the bridge
 * tracks Gorhom's actual index via `onChange` (`openRef`) and only presents when
 * closed / dismisses when open — idempotent against the redundant `visible=false`
 * passes before first open AND the user-close → onDismiss → visible=false that
 * follows every gesture close. Without this the popups opened once and never
 * again. See gotcha #45.
 */
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

  const defersClose = useCallback(() => dirty, [dirty]);
  useWebBackDismiss(visible, guardedDismiss, defersClose);
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
        {/* The sheet's own close affordances read the GUARDED dismiss from here,
            so the discard prompt covers the header button too. */}
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
