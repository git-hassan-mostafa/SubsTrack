import { useEffect, useState, type ReactNode } from "react";
import { Modal, Pressable, useWindowDimensions, View } from "react-native";
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

  // translateY: 0 = fully open (resting), `height` = fully off-screen (closed).
  const translateY = useSharedValue(height);
  // The panel's own measured height — drives the drag-to-close threshold and is
  // the fallback slide distance until the panel has laid out.
  const panelHeight = useSharedValue(height);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = withTiming(0, {
        duration: DURATION,
        easing: Easing.out(Easing.cubic),
      });
    } else if (mounted) {
      translateY.value = withTiming(
        height,
        { duration: DURATION, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, height]);

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
        runOnJS(onDismiss)();
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
