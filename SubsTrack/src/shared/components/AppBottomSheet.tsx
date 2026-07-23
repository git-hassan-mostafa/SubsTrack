import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { Platform, View, useWindowDimensions } from "react-native";
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
import { useWebBackDismiss } from "@/src/shared/hooks/useWebBackDismiss";
import { COLORS } from "@/src/shared/constants";

export type BottomSheetVariant = "auto" | "full";

interface AppBottomSheetProps {
  visible: boolean;
  onDismiss: () => void;
  children: ReactNode;
  /**
   * `auto` — the sheet is sized to its content (transient popups: dropdowns,
   * pickers, action menus). `full` — a tall, fixed sheet the caller scrolls
   * itself (forms / detail sheets). Defaults to `auto`.
   */
  variant?: BottomSheetVariant;
  /**
   * `auto`-only. When the body contains a virtualized list
   * (`BottomSheetFlatList`), pass `scrollable` so the sheet uses a FIXED snap
   * height and the body fills it with `flex:1` — Gorhom's `enableDynamicSizing`
   * measures a virtualized list wrong and leaves a big empty gap under a long
   * list (the list scrolls internally while the sheet is taller than it).
   */
  scrollable?: boolean;
}

// A `scrollable` auto sheet opens at this fraction of the frame; its list fills
// the sheet (no dead space) and scrolls internally.
const LIST_SNAP_RATIO = 0.7;

// Cap width on wide viewports (desktop web / tablet). Phones are always
// narrower, so this never constrains a phone layout.
const MAX_WIDTH: Record<BottomSheetVariant, number> = {
  auto: 512,
  full: 768,
};
// Height of a `full` sheet — leaves a strip of backdrop at the top so it reads
// as a bottom sheet (and gives a tap-to-close / drag-down target).
const FULL_SNAP = ["92%"];

/**
 * The single Gorhom bottom-sheet foundation for the whole app. Every popup and
 * form sheet is built on this via {@link BottomSheetScaffold} (`auto`) or
 * {@link FormSheet} (`full`). It replaces the previous hand-rolled Reanimated
 * sheet.
 *
 * Gorhom gives us drag-down-to-close, backdrop-tap-to-close, and — because it
 * is a `BottomSheetModal` under a `BottomSheetModalProvider` — Android
 * hardware-back closes the top sheet automatically. On web, browser Back is
 * wired for the `full` (page-like) variant via {@link useWebBackDismiss}; the
 * transient `auto` popups stay out of the history stack (gotcha #44/#45).
 *
 * Callers stay declarative (`visible` / `onDismiss`); this bridges that to
 * Gorhom's imperative `present()` / `dismiss()` and guards the completion
 * callback so a programmatic close (visible → false) never re-fires `onDismiss`.
 *
 * Sizing: `full` uses a fixed `snapPoints` (92%); `auto` (popups) uses Gorhom's
 * `enableDynamicSizing` to fit its content, capped by `maxDynamicContentSize`.
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
}: AppBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  // Frame height (not window height) so `maxDynamicContentSize` caps an `auto`
  // sheet against the real screen (minus status/nav bars).
  const { height: frameHeight } = useSafeAreaFrame();
  const ref = useRef<BottomSheetModal>(null);

  // Only the page-like `full` sheets participate in browser Back on web; `auto`
  // popups pass active=false, making the hook a no-op for them.
  useWebBackDismiss(variant === "full" && visible, onDismiss);

  // Track Gorhom's REAL open/closed state (its sheet index, via `onChange`).
  // The bridge below drives present()/dismiss() off this — not off assumptions —
  // so redundant `visible` passes and the user-close → onDismiss → visible=false
  // sequence can never fire a present()/dismiss() out of sync with Gorhom.
  //
  // Why this matters: the `auto` popups (`ActionMenu`, `Dropdown`, pickers …)
  // are ALWAYS mounted and toggle `visible`. Calling Gorhom's dismiss() on a
  // modal that is already closed (or was never presented) WEDGES it — a later
  // present() then silently no-ops (no animation, no onChange). That is why the
  // popups failed to open at all, and then (after a naive first-present guard)
  // opened only ONCE: the redundant dismiss() that follows a user-gesture close
  // wedged them for every subsequent open. Gating both calls on the real state
  // makes the bridge idempotent and fixes both.
  const openRef = useRef(false);

  const handleChange = useCallback((index: number) => {
    openRef.current = index >= 0;
  }, []);

  useEffect(() => {
    if (visible && !openRef.current) {
      ref.current?.present();
    } else if (!visible && openRef.current) {
      ref.current?.dismiss();
    }
  }, [visible]);

  // Gorhom fired its dismissal. `onChange(-1)` has already flipped openRef to
  // false, so the effect above won't call a redundant dismiss(). If the caller
  // still has us open this was a user gesture (drag / backdrop / hardware-back)
  // — propagate it so the caller sets visible=false too.
  const handleDismiss = useCallback(() => {
    openRef.current = false;
    if (visible) onDismiss();
  }, [onDismiss, visible]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  );

  // Width cap for wide viewports (desktop web / tablet). We center the sheet by
  // padding the OUTER container symmetrically — never by constraining the sheet
  // container's own `style`, which breaks Gorhom's height measurement (the auto
  // sheet then never appears) and, with `width:100%`+`maxWidth`, pins it left.
  // On phones the screen is narrower than the cap, so `sidePad` is 0 and this is
  // a no-op — the sheet stays edge-to-edge.
  const sidePad = Math.max(0, (screenWidth - MAX_WIDTH[variant]) / 2);
  const containerStyle =
    sidePad > 0 ? { paddingHorizontal: sidePad } : undefined;

  // Three layouts:
  // - `full`            → fixed 92% snap, body fills it (`flex:1`), caller scrolls.
  // - `auto scrollable` → fixed list-height snap, body fills it so the list fills
  //   the sheet and scrolls internally (no dead space under a long virtualized
  //   list, which is what `enableDynamicSizing` produces).
  // - `auto` (default)  → dynamic size, body hugs its content (small popups /
  //   action menus / non-list content).
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
      onDismiss={handleDismiss}
      stackBehavior="push"
      enablePanDownToClose
      // Dynamic sizing only for content-hugging `auto` popups (no fixed snap).
      enableDynamicSizing={!useFixedSnap}
      maxDynamicContentSize={!useFixedSnap ? frameHeight * 0.9 : undefined}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      keyboardBehavior={Platform.OS === "web" ? "extend" : "interactive"}
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <InsideBottomSheetContext.Provider value={true}>
        {useFixedSnap ? (
          // Fixed-height sheet: the body fills it so the list/scroll view inside
          // takes the whole height (no gap under a long list).
          <View style={{ flex: 1 }}>{children}</View>
        ) : (
          <BottomSheetView style={{ paddingBottom: insets.bottom }}>
            {children}
          </BottomSheetView>
        )}
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
