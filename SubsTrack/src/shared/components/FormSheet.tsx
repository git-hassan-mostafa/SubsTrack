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
import { ResponsiveContainer } from "./ResponsiveContainer";
import { SheetDragArea } from "./SheetDragArea";
import { PressableOpacity } from "./PressableOpacity";
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
  subject?: string | null;
  dismissLabel?: string;
  dirty?: boolean;
  scrollRef?: RefObject<SheetScrollTo | null>;
  menuActions?: ActionMenuItem[];
  fullBleed?: boolean;
  children: ReactNode;
}

// full-height form / detail sheet + shared chrome — see docs/ui-patterns.md
export function FormSheet({
  visible = true,
  onDismiss,
  title,
  subject,
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
      {(dismiss) => (
        <FormSheetBody
          visible={visible}
          title={title}
          subject={subject}
          dismissLabel={dismissLabel}
          onDismiss={dismiss}
          scrollRef={scrollRef}
          menuActions={menuActions}
          fullBleed={fullBleed}
        >
          {children}
        </FormSheetBody>
      )}
    </AppBottomSheet>
  );
}

// its own component because a render-prop function cannot hold hooks
function FormSheetBody({
  visible,
  title,
  subject,
  dismissLabel,
  onDismiss,
  scrollRef,
  menuActions,
  fullBleed,
  children,
}: {
  visible: boolean;
  title: string;
  subject?: string | null;
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
        {subject ? (
          <View className="flex-1 me-3 flex-row items-center gap-2.5">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-indigo-50">
              <Ionicons name="person-outline" size={18} color={COLORS.primary} />
            </View>
            <View className="flex-1">
              <Text
                fontWeight="Bold"
                numberOfLines={1}
                className="text-lg text-gray-900"
              >
                {subject}
              </Text>
              <Text numberOfLines={1} className="text-xs text-gray-500">
                {title}
              </Text>
            </View>
          </View>
        ) : (
          <Text fontWeight="Bold" className="flex-1 me-3 text-lg text-gray-900">
            {title}
          </Text>
        )}
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
          <PressableOpacity onPress={onDismiss}>
            <Text fontWeight="Medium" className="text-base text-primary">
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
