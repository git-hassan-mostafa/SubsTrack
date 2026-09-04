import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { View } from "react-native";
import {
  BottomSheetScrollView,
  type BottomSheetScrollViewMethods,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { AppBottomSheet } from "./AppBottomSheet";
import { useSheetDismiss } from "./sheetDismissContext";
import { ResponsiveContainer } from "./ResponsiveContainer";
import { SheetDragArea } from "./SheetDragArea";
import { PressableOpacity } from "./PressableOpacity/PressableOpacity";
import { Text } from "./Text";
import { ActionMenu, type ActionMenuItem } from "./ActionMenu";
import { COLORS } from "@/src/shared/constants";
import { useAfterFirstFrame } from "@/src/shared/hooks/useAfterFirstFrame";

/** Scrolls the sheet body to a content offset; `0` is the top of the form. */
export type SheetScrollTo = (y: number) => void;

interface FormSheetProps {
  visible?: boolean;
  onDismiss: () => void;
  title: string;
  dismissLabel?: string;
  dirty?: boolean;
  scrollRef?: RefObject<SheetScrollTo | null>;
  menuActions?: ActionMenuItem[];
  fullBleed?: boolean;
  children: ReactNode;
}

/**
 * Full-height form / detail bottom sheet. Wraps {@link AppBottomSheet}
 * (`variant="full"`) with the shared chrome every form used to hand-roll: a
 * Gorhom drag handle, a header (title + one dismiss action), and a scrollable
 * body ({@link BottomSheetScrollView}). `full` sheets turn Gorhom's content pan
 * off (gotcha #45), so the body scrolls freely and the sheet is dragged by its
 * handle — plus the whole header row, which is a {@link SheetDragArea}. Body
 * width is capped on wide viewports via {@link ResponsiveContainer}.
 *
 * Text inputs rendered inside automatically become `BottomSheetTextInput`
 * (see {@link useSheetTextInput}), so the keyboard pushes the focused field
 * into view — no per-field wiring needed. Replaces the old `SheetModal`.
 *
 * The body is rendered one frame after the chrome ({@link useAfterFirstFrame}):
 * a form is by far the most expensive part of an open, and rendering it in the
 * same commit holds back the native layout the slide-up animation waits on. The
 * header appears immediately, the fields land during the slide. Safe because a
 * `full` sheet has a FIXED snap point — its height never depends on the body.
 */
export function FormSheet({
  visible = true,
  onDismiss,
  title,
  dismissLabel,
  dirty = false,
  scrollRef,
  menuActions,
  fullBleed = false,
  children,
}: FormSheetProps) {
  return (
    <AppBottomSheet
      visible={visible}
      onDismiss={onDismiss}
      variant="full"
      dirty={dirty}
    >
      <FormSheetBody
        visible={visible}
        title={title}
        dismissLabel={dismissLabel}
        onDismiss={onDismiss}
        scrollRef={scrollRef}
        menuActions={menuActions}
        fullBleed={fullBleed}
      >
        {children}
      </FormSheetBody>
    </AppBottomSheet>
  );
}

/**
 * Split out so it renders INSIDE the sheet and can read the guarded dismiss from
 * {@link SheetDismissContext} — the header button must go through the same
 * unsaved-changes check as Back and the drag gesture.
 */
function FormSheetBody({
  visible,
  title,
  dismissLabel,
  onDismiss,
  scrollRef,
  menuActions,
  fullBleed,
  children,
}: {
  visible: boolean;
  title: string;
  dismissLabel?: string;
  onDismiss: () => void;
  scrollRef?: RefObject<SheetScrollTo | null>;
  menuActions?: ActionMenuItem[];
  fullBleed?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bodyReady = useAfterFirstFrame(visible);
  const dismiss = useSheetDismiss(onDismiss);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasMenu = (menuActions?.length ?? 0) > 0;
  const [openActions, setOpenActions] = useState<ActionMenuItem[]>([]);

  function openMenu() {
    setOpenActions(menuActions ?? []);
    setMenuOpen(true);
  }

  const bodyRef = useRef<BottomSheetScrollViewMethods>(null);
  const scrollTo = useCallback<SheetScrollTo>((y) => {
    bodyRef.current?.scrollTo({ y, animated: true });
  }, []);

  useEffect(() => {
    if (!scrollRef) return;
    scrollRef.current = scrollTo;
    return () => {
      scrollRef.current = null;
    };
  }, [scrollRef, scrollTo]);

  return (
    <ResponsiveContainer className="flex-1">
      <SheetDragArea className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
        <Text fontWeight="Bold" className="flex-1 me-3 text-lg text-gray-900">
          {title}
        </Text>
        <View className="flex-row items-center gap-4">
          {hasMenu ? (
            <PressableOpacity
              onPress={openMenu}
              hitSlop={8}
              accessibilityLabel={t("common.more_actions")}
            >
              <Ionicons
                name="ellipsis-vertical"
                size={20}
                color={COLORS.gray600}
              />
            </PressableOpacity>
          ) : null}
          <PressableOpacity onPress={dismiss}>
            <Text className="text-base text-primary font-medium">
              {dismissLabel ?? t("common.cancel")}
            </Text>
          </PressableOpacity>
        </View>
      </SheetDragArea>

      <BottomSheetScrollView
        ref={bodyRef}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: fullBleed ? 0 : 24,
          paddingTop: fullBleed ? 0 : 24,
          paddingBottom: 48 + insets.bottom,
        }}
      >
        {bodyReady ? children : null}
      </BottomSheetScrollView>

      {openActions.length > 0 ? (
        <ActionMenu
          visible={menuOpen}
          title={title}
          actions={openActions}
          onDismiss={() => setMenuOpen(false)}
        />
      ) : null}
    </ResponsiveContainer>
  );
}
