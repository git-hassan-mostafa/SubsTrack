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
  /**
   * `auto` — the sheet is sized to its content (transient popups: dropdowns,
   * pickers, action menus). Its body must use PLAIN RN scrollables, never
   * Gorhom's (see the class doc — they break the content measurement).
   * `full` — a tall, fixed sheet the caller scrolls itself (forms / detail
   * sheets). Defaults to `auto`.
   */
  variant?: BottomSheetVariant;
  /**
   * `auto`-only. Pass `scrollable` when the body is a long list that should own
   * the sheet height: the sheet uses a FIXED snap height and the body fills it
   * with `flex:1`. Fixed snap also switches dynamic sizing off, so a Gorhom
   * scrollable (`BottomSheetFlatList`) is safe here.
   */
  scrollable?: boolean;
  /**
   * Set by forms: the body holds unsaved edits, so every close path must ask to
   * discard first (see {@link useUnsavedChangesGuard}). Covers the header button,
   * Back, the drag-down gesture and a backdrop tap in one place.
   */
  dirty?: boolean;
}

// A `scrollable` auto sheet opens at this fraction of the frame; its list fills
// the sheet (no dead space) and scrolls internally.
const LIST_SNAP_RATIO = 0.7;

// Web only: cap the sheet to the page content column (ResponsiveContainer's
// `max-w-3xl`) so it doesn't stretch across a wide browser window. Native sheets
// stay edge-to-edge — that is the platform convention there.
const WEB_MAX_WIDTH = 768;
// Height of a `full` sheet — leaves a strip of backdrop at the top so it reads
// as a bottom sheet (and gives a tap-to-close / drag-down target).
const FULL_SNAP = ["92%"];

// Gorhom's default open/close animation is platform-split: iOS gets a very stiff
// spring that settles almost instantly, Android a 250ms timing curve — so sheets
// measurably lag on Android out of the box. Override Android only (undefined =
// keep Gorhom's default), matching iOS's snappiness. `Easing.out(Easing.cubic)`
// decelerates without the long tail of Gorhom's `Easing.out(Easing.exp)`.
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
  // Frame height (not window height) so `maxDynamicContentSize` caps an `auto`
  // sheet against the real screen (minus status/nav bars).
  const { height: frameHeight } = useSafeAreaFrame();
  const ref = useRef<BottomSheetModal>(null);

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

  // Set once the sheet is being torn down. Form sheets are CONDITIONALLY MOUNTED
  // (`{formVisible && <XFormSheet/>}`), so a successful Save unmounts the whole
  // tree instead of flipping `visible` to false — Gorhom then fires its dismissal
  // on the way out while `visible` is still `true` and `dirty` is still `true`
  // (the fields were edited; saving doesn't reset the baseline). `handleDismiss`
  // read that as a user close and opened "Discard changes?" AFTER the form had
  // already closed. Nothing may ask a question on behalf of an unmounting sheet.
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

  // "Keep editing" — put the sheet back where it was. Only the drag path needs
  // it (a drag has already moved the sheet by the time we intercept); the header
  // button and Back are intercepted before anything moves.
  // `expand()` rather than snapToIndex(0): it targets the largest available snap
  // point, which is right for a fixed-snap form AND for a dynamically-sized sheet
  // (where index 0 isn't a meaningful target).
  const reopen = useCallback(() => {
    if (!openRef.current) ref.current?.present();
    else ref.current?.expand();
  }, []);

  const [guardedDismiss, asking] = useUnsavedChangesGuard(
    dirty,
    onDismiss,
    reopen,
  );

  // Back closes the top-most sheet on both platforms, for EVERY variant — a popup
  // must swallow it too, otherwise Back falls through to the router and changes
  // the screen out from under it (which also takes the popup with it). Routed
  // through the guard so Back on a dirty form asks first.
  //
  // The two platforms need OPPOSITE handling while the discard prompt is up, both
  // so that one Back press can't answer the prompt AND close the sheet under it:
  //
  // - Android: go inactive. `BackHandler` fires listeners newest-first and the
  //   prompt is an RN `Modal` taking Back via `onRequestClose`, so the sheet's
  //   listener has to be gone or it runs on the same press.
  // - Web: STAY registered and declare `defersClose`. The history stack mirrors
  //   its depth in real history, one sentinel per entry, so deregistering mid-ask
  //   abandoned a sentinel and the prompt's own close then unwound past it into
  //   the route ("discard takes me to the previous page"). `defersClose` instead
  //   tells the popstate handler this surface isn't closing yet, so it keeps its
  //   entry and re-pushes its sentinel.
  const defersClose = useCallback(() => dirty, [dirty]);
  useWebBackDismiss(visible, guardedDismiss, defersClose);
  useAndroidBackDismiss(visible && !asking, guardedDismiss);

  useEffect(() => {
    if (visible && !openRef.current) {
      // The previously focused field keeps its keyboard over the opening sheet
      // — see gotcha #124.
      Keyboard.dismiss();
      ref.current?.present();
    } else if (!visible && openRef.current) {
      ref.current?.dismiss();
    }
  }, [visible]);

  // Catch a DRAG-to-close on a dirty form at the moment the close animation is
  // about to start, and snap straight back so the prompt appears over a sheet
  // that is still on screen (letting it play out first would flash the form away
  // and then bounce it back, which reads as a glitch).
  //
  // `visible` is the guard against the programmatic close: when the caller is
  // closing us on purpose (Save, or the discard the user just accepted), the
  // animation must be allowed through.
  const handleAnimate = useCallback(
    (_fromIndex: number, toIndex: number) => {
      if (toIndex !== -1 || !dirty || !visible || asking) return;
      if (unmountingRef.current) return;
      ref.current?.expand();
      guardedDismiss();
    },
    [dirty, visible, asking, guardedDismiss],
  );

  // Gorhom fired its dismissal. `onChange(-1)` has already flipped openRef to
  // false, so the effect above won't call a redundant dismiss(). If the caller
  // still has us open this was a user gesture (drag / backdrop / hardware-back)
  // — propagate it so the caller sets visible=false too.
  //
  // Dirty forms are normally intercepted earlier (onAnimate for a drag, the
  // backdrop's onPress, the guarded header button / Back), so this is the last
  // resort for a close that still got through: the guard runs again and `reopen`
  // re-presents the sheet if the user declines. Skipped while the prompt is
  // already up, so one gesture can never ask twice.
  const handleDismiss = useCallback(() => {
    openRef.current = false;
    if (asking || unmountingRef.current) return;
    if (visible) guardedDismiss();
  }, [asking, guardedDismiss, visible]);

  // A dirty sheet must ASK before it animates away, so a backdrop tap runs the
  // guard instead of closing. `pressBehavior={0}` — NOT `"none"`: Gorhom drops the
  // whole tap GestureDetector when the behavior is "none", which would make
  // `onPress` (and the backdrop) dead. Snapping to index 0 is a no-op for the
  // single-snap sheets that can be dirty, so the tap only runs the guard.
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

  // Width cap on wide web viewports, applied to Gorhom's HOSTING CONTAINER (the
  // backdrop is its sibling, so it still covers the whole window).
  // `width` + AUTO side margins is the only thing that centers it: the sheet is
  // absolutely positioned and Gorhom re-applies `left:0/right:0` AFTER our
  // style, so `left`/`paddingHorizontal` can't move it (padding never insets an
  // absolute child) and `width` alone would pin it to one edge. Auto margins
  // still center an over-constrained absolute box, in LTR and RTL alike.
  const containerStyle: ViewStyle | undefined =
    Platform.OS === "web" && screenWidth > WEB_MAX_WIDTH
      ? { width: WEB_MAX_WIDTH, marginHorizontal: "auto" }
      : undefined;

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
      onAnimate={handleAnimate}
      onDismiss={handleDismiss}
      stackBehavior="push"
      enablePanDownToClose
      animationConfigs={ANIMATION_CONFIGS}
      // Dynamic sizing only for content-hugging `auto` popups (no fixed snap).
      enableDynamicSizing={!useFixedSnap}
      maxDynamicContentSize={!useFixedSnap ? frameHeight * 0.9 : undefined}
      snapPoints={snapPoints}
      // Off for EVERY variant: the content pan steals the vertical drag from any
      // non-Gorhom scrollable (which every `auto` body now is — see the class
      // doc) AND hard-locks Gorhom's own scrollables whenever the sheet isn't
      // exactly at its extended position. The handle, the backdrop and Back
      // still close every sheet. See gotcha #45/#47.
      enableContentPanningGesture={false}
      backdropComponent={renderBackdrop}
      keyboardBehavior={Platform.OS === "web" ? "extend" : "interactive"}
      keyboardBlurBehavior="restore"
      // NOT `adjustResize`: that tells Gorhom "Android resizes the window itself,
      // stay out of it" — untrue under edge-to-edge (app.json `edgeToEdgeEnabled`),
      // where the window never shrinks, so the sheet kept its full height and the
      // bottom of its content stayed unreachable under the keyboard. `adjustPan`
      // (Gorhom's default) lets its own `interactive` handling do the work.
      android_keyboardInputMode="adjustPan"
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <InsideBottomSheetContext.Provider value={true}>
        {/* The sheet's own close affordances read the GUARDED dismiss from here,
            so the discard prompt covers the header button too. */}
        <SheetDismissContext.Provider value={guardedDismiss}>
          {useFixedSnap ? (
            // Fixed-height sheet: the body fills it so the list/scroll view inside
            // takes the whole height (no gap under a long list). A `full` body pads
            // its own scroll area (FormSheet), so only the list picker needs the
            // safe-area inset here — without it its last row sits under the nav bar.
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
