import type { ReactNode } from "react";
import { View } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { AppBottomSheet } from "./AppBottomSheet";
import { ResponsiveContainer } from "./ResponsiveContainer";
import { PressableOpacity } from "./PressableOpacity/PressableOpacity";
import { Text } from "./Text";

interface FormSheetProps {
  /** Defaults to `true` — most form sheets are mounted only while open. */
  visible?: boolean;
  onDismiss: () => void;
  /** Header title. */
  title: string;
  /** Right-hand dismiss action label. Defaults to `common.cancel`. */
  dismissLabel?: string;
  children: ReactNode;
}

/**
 * Full-height form / detail bottom sheet. Wraps {@link AppBottomSheet}
 * (`variant="full"`) with the shared chrome every form used to hand-roll: a
 * Gorhom drag handle, a header (title + one dismiss action), and a scrollable
 * body ({@link BottomSheetScrollView}, which cooperates with the sheet's
 * pan-to-close). Body width is capped on wide viewports via
 * {@link ResponsiveContainer}.
 *
 * Text inputs rendered inside automatically become `BottomSheetTextInput`
 * (see {@link useSheetTextInput}), so the keyboard pushes the focused field
 * into view — no per-field wiring needed. Replaces the old `SheetModal`.
 */
export function FormSheet({
  visible = true,
  onDismiss,
  title,
  dismissLabel,
  children,
}: FormSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <AppBottomSheet visible={visible} onDismiss={onDismiss} variant="full">
      <ResponsiveContainer className="flex-1">
        <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
          <Text fontWeight="Bold" className="text-lg text-gray-900">
            {title}
          </Text>
          <PressableOpacity onPress={onDismiss}>
            <Text className="text-base text-primary font-medium">
              {dismissLabel ?? t("common.cancel")}
            </Text>
          </PressableOpacity>
        </View>

        <BottomSheetScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: 48 + insets.bottom,
          }}
        >
          {children}
        </BottomSheetScrollView>
      </ResponsiveContainer>
    </AppBottomSheet>
  );
}
