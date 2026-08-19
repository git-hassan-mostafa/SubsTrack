import { useCallback, useRef, type ReactNode } from "react";
import {
  BottomSheetScrollView,
  type BottomSheetScrollViewMethods,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { AppBottomSheet } from "./AppBottomSheet";
import { useSheetDismiss } from "./sheetDismissContext";
import { SheetScrollContext } from "./sheetScrollContext";
import { ResponsiveContainer } from "./ResponsiveContainer";
import { SheetDragArea } from "./SheetDragArea";
import { PressableOpacity } from "./PressableOpacity/PressableOpacity";
import { Text } from "./Text";
import { useAfterFirstFrame } from "@/src/shared/hooks/useAfterFirstFrame";

interface FormSheetProps {
  /** Defaults to `true` — most form sheets are mounted only while open. */
  visible?: boolean;
  onDismiss: () => void;
  /** Header title. */
  title: string;
  /** Right-hand dismiss action label. Defaults to `common.cancel`. */
  dismissLabel?: string;
  /**
   * The form holds unsaved edits — closing it (header button, Back, drag-down,
   * backdrop) asks to discard first. Wire it to a real dirty check; see
   * {@link useDirtyForm}.
   */
  dirty?: boolean;
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
  children,
}: {
  visible: boolean;
  title: string;
  dismissLabel?: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bodyReady = useAfterFirstFrame(visible);
  const dismiss = useSheetDismiss(onDismiss);

  const scrollRef = useRef<BottomSheetScrollViewMethods>(null);
  // Published to the body so a control low in the form can bring a part of it
  // back into view; see {@link SheetScrollContext}.
  const scrollTo = useCallback((y: number) => {
    scrollRef.current?.scrollTo({ y, animated: true });
  }, []);

  return (
    <ResponsiveContainer className="flex-1">
      <SheetDragArea className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
        <Text fontWeight="Bold" className="text-lg text-gray-900">
          {title}
        </Text>
        <PressableOpacity onPress={dismiss}>
          <Text className="text-base text-primary font-medium">
            {dismissLabel ?? t("common.cancel")}
          </Text>
        </PressableOpacity>
      </SheetDragArea>

      <BottomSheetScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 24,
          paddingBottom: 48 + insets.bottom,
        }}
      >
        <SheetScrollContext.Provider value={scrollTo}>
          {bodyReady ? children : null}
        </SheetScrollContext.Provider>
      </BottomSheetScrollView>
    </ResponsiveContainer>
  );
}
