import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, Platform, Pressable, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface BottomSheetScaffoldProps {
  visible: boolean;
  onDismiss: () => void;
  children: ReactNode;
  // Optional wrapper so callers that need keyboard avoidance can wrap the panel
  // (e.g. with react-native-keyboard-controller's KeyboardAvoidingView). It
  // receives the pinned-to-bottom container and must render its children.
  wrap?: (children: ReactNode) => ReactNode;
}

const DURATION = 220;
// Cap the panel width on wide viewports (desktop web / tablet); phones are
// always narrower, so this is a no-op on phone layouts.
const MAX_WIDTH = 512;
// Fraction of the panel height (or flick velocity) past which a downward drag
// dismisses instead of springing back.
const CLOSE_DISTANCE_RATIO = 0.25;
const CLOSE_VELOCITY = 800;
// Bounds for the drag-release close animation so it stays smooth: never snap
// (too fast) nor drag on (too slow), whatever the release velocity/distance.
const MIN_CLOSE_DURATION = 120;
const MAX_CLOSE_DURATION = 320;

// On web the sheet CLOSES INSTANTLY (no slide-out) — see the doc block below:
// react-native-web's Modal keeps a full-screen `position:fixed; zIndex:9999`
// wrapper over the whole page for as long as it is mounted, so any slide-out
// window would swallow the user's first tap after a fast drag-dismiss. Native
// has no such DOM layer, so it keeps the smooth slide-out.
const isWeb = Platform.OS === "web";

/**
 * Shared bottom-sheet shell for transient tap-outside popups (dropdowns,
 * pickers, action menus). The panel slides up from the bottom edge, pinned to
 * the bottom and centered horizontally (capped width on wide/web viewports),
 * with a drag-handle line at the top. The user can DRAG THE SHEET DOWN to
 * dismiss it (past ~25% of its height, or with a fast downward flick);
 * releasing before that springs it back.
 *
 * Built on Reanimated + a gesture-handler Pan gesture (the same stack as
 * useHorizontalSwipe) rather than the Gorhom bottom-sheet library: every popup
 * already funnels through this one shell, so we own the exact look (handle,
 * width cap, backdrop-fade, centered-vs-bottom split) without pulling in a
 * heavy dependency for a single drag interaction.
 *
 * Layout is done with explicit `style` (not NativeWind `className`) on the
 * structural containers: `className` does not reliably resolve to flex/align
 * styles on Animated views, which previously made the panel jump to the top
 * and stretch full-width. Only the panel's pure visual look keeps `className`.
 *
 * The backdrop only FADES in place (its opacity also eases out as the sheet is
 * dragged down) while the panel slides — never RN's `animationType="slide"`,
 * which would slide the whole modal, dark overlay included.
 *
 * CLOSE IS INSTANT ON WEB (native keeps the smooth slide-out). react-native-web
 * renders every Modal inside a full-screen `position:fixed; zIndex:9999`
 * wrapper that sits above the page and catches every tap for as long as the
 * Modal is mounted — and it is internal to RN-Web, so we cannot make it
 * pointer-transparent. Any slide-out animation therefore keeps that wrapper
 * mounted for its whole duration, and after a FAST drag-dismiss the user's
 * first tap lands inside that window and is swallowed (the page only becomes
 * clickable on the second tap). Slow drags escaped it only because the user
 * happened to tap after the window. So on web we unmount the Modal immediately
 * on close; native (no such DOM layer) keeps the velocity-scaled slide-out.
 *
 * Deliberately NOT using `useWebBackDismiss` — like the centered popups it
 * replaces, it closes by tapping the backdrop (and native hardware-back via
 * `onRequestClose`), keeping it out of the browser history stack (see gotcha
 * #44 / useWebBackDismiss scope note).
 */
export function BottomSheetScaffold({
  visible,
  onDismiss,
  children,
  wrap,
}: BottomSheetScaffoldProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  // Keep the modal mounted through the exit animation: `visible` drives the
  // animation; `mounted` unmounts the modal only once the slide-out finishes.
  const [mounted, setMounted] = useState(visible);

  // Native only: set when the sheet was closed by a drag-down. The gesture
  // already slid the panel off-screen, so the exit effect unmounts at once
  // instead of running a redundant second slide-out. (On web, close is always
  // instant, so this flag is unused there.)
  const closedByDrag = useRef(false);

  // translateY: 0 = fully open (resting), `height` = fully off-screen (closed).
  const translateY = useSharedValue(height);
  // The panel's own measured height — drives the drag-to-close threshold and is
  // the fallback slide distance until the panel has laid out.
  const panelHeight = useSharedValue(height);

  useEffect(() => {
    if (visible) {
      // Start from the bottom, then slide up. The reset matters on web, where a
      // previous instant-close can leave translateY at a mid-drag value.
      translateY.value = height;
      setMounted(true);
      translateY.value = withTiming(0, {
        duration: DURATION,
        easing: Easing.out(Easing.cubic),
      });
    } else if (mounted) {
      if (isWeb) {
        // Web: unmount at once so the full-screen Modal wrapper stops catching
        // taps immediately (see doc block) — no slide-out.
        setMounted(false);
      } else if (closedByDrag.current) {
        // Drag already slid the panel off-screen — unmount now, no second
        // animation.
        closedByDrag.current = false;
        setMounted(false);
      } else {
        translateY.value = withTiming(
          height,
          { duration: DURATION, easing: Easing.in(Easing.cubic) },
          (finished) => {
            if (finished) runOnJS(setMounted)(false);
          },
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, height]);

  // Native only: called (via runOnJS) once the drag slide-out finishes. Flag
  // that the panel is already off-screen so the exit effect unmounts at once,
  // then dismiss.
  const dismissFromDrag = () => {
    closedByDrag.current = true;
    onDismiss();
  };

  const panGesture = Gesture.Pan()
    // Only claim the gesture once it is clearly a downward drag, so any
    // scrollable list inside the sheet keeps handling vertical scroll.
    .activeOffsetY(10)
    .failOffsetY(-10)
    .onUpdate((e) => {
      // Follow the finger downward only; ignore upward drags past the rest spot.
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      const shouldClose =
        e.translationY > panelHeight.value * CLOSE_DISTANCE_RATIO ||
        e.velocityY > CLOSE_VELOCITY;
      if (shouldClose) {
        if (isWeb) {
          // Web: close at once (the exit effect unmounts immediately) so the
          // full-screen Modal wrapper stops catching taps and the first page
          // tap works. A slide-out would keep it mounted and eat that tap.
          runOnJS(onDismiss)();
          return;
        }
        // Native: continue the downward motion smoothly from where the finger
        // left off, sliding the panel the rest of the way off-screen, then
        // dismiss from the completion callback via dismissFromDrag (which flags
        // closedByDrag so the exit effect unmounts at once rather than running a
        // second slide-out over the still-mounted modal).
        //
        // Carry the release velocity into the animation: pick a duration from
        // the remaining distance ÷ fling speed so the panel keeps travelling at
        // roughly the same visual speed instead of a fixed-length jump. Clamp it
        // so a slow release still glides shut and a hard flick never snaps.
        const remaining = Math.max(1, height - translateY.value);
        const speed = Math.max(CLOSE_VELOCITY, e.velocityY);
        const duration = Math.min(
          MAX_CLOSE_DURATION,
          Math.max(MIN_CLOSE_DURATION, (remaining / speed) * 1000),
        );
        translateY.value = withTiming(
          height,
          { duration, easing: Easing.out(Easing.cubic) },
          (finished) => {
            if (finished) runOnJS(dismissFromDrag)();
          },
        );
      } else {
        translateY.value = withTiming(0, {
          duration: DURATION,
          easing: Easing.out(Easing.cubic),
        });
      }
    });

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Backdrop fades in with the slide and eases back out as the sheet is dragged
  // down, so the overlay feels tied to the panel's position.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, panelHeight.value],
      [1, 0],
      "clamp",
    ),
  }));

  if (!mounted) return null;

  const container = (
    // Pin the panel to the bottom, centered horizontally.
    <View style={{ flex: 1, justifyContent: "flex-end", alignItems: "center" }}>
      {/* Backdrop tap target fills the space above the panel. */}
      <Pressable
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        onPress={onDismiss}
      />
      <GestureDetector gesture={panGesture}>
        <Animated.View
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0) panelHeight.value = h;
          }}
          style={[
            { width: "100%", maxWidth: MAX_WIDTH },
            panelStyle,
          ]}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="bg-white rounded-t-3xl overflow-hidden"
            style={{ paddingBottom: insets.bottom }}
          >
            {/* Drag handle — signals the sheet can be dragged down / dismissed. */}
            <View className="items-center pt-3 pb-1">
              <View className="h-1 w-10 rounded-full bg-gray-300" />
            </View>
            {children}
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );

  return (
    <Modal visible transparent animationType="none" onRequestClose={onDismiss}>
      <Animated.View
        style={[
          { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
          backdropStyle,
        ]}
      >
        {wrap ? wrap(container) : container}
      </Animated.View>
    </Modal>
  );
}
