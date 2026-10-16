import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { AppBottomSheet } from "./AppBottomSheet";
import { ResponsiveContainer } from "./ResponsiveContainer";
import { IconButton } from "./IconButton";
import { SheetHeader } from "./SheetHeader";
import { ActionMenu, type ActionMenuItem } from "./ActionMenu";
import { COLORS } from "@/src/shared/constants";
import { useAfterFirstFrame } from "@/src/shared/hooks/useAfterFirstFrame";
import { SheetScrollView } from "./SheetScrollComponents";

/** Scrolls the sheet body to a content offset; `0` is the top of the form. */
export type SheetScrollTo = (y: number) => void;

interface FormSheetProps {
  visible?: boolean;
  onDismiss: () => void;
  title: string;
  subject?: string | null;
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
      dismissOnBackdropPress={false}
    >
      {(dismiss) => (
        <FormSheetBody
          visible={visible}
          title={title}
          subject={subject}
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
  onDismiss,
  scrollRef,
  menuActions,
  fullBleed,
  children,
}: {
  visible: boolean;
  title: string;
  subject?: string | null;
  onDismiss: () => void;
  scrollRef?: RefObject<SheetScrollTo | null>;
  menuActions?: ActionMenuItem[];
  fullBleed?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const bodyReady = useAfterFirstFrame(visible);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasMenu = (menuActions?.length ?? 0) > 0;
  const [openActions, setOpenActions] = useState<ActionMenuItem[]>([]);

  function openMenu() {
    setOpenActions(menuActions ?? []);
    setMenuOpen(true);
  }

  const bodyRef = useRef<ScrollView>(null);
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
      <SheetHeader
        title={title}
        subject={subject}
        onClose={onDismiss}
        actions={
          hasMenu ? (
            <IconButton
              icon="ellipsis-vertical"
              size={20}
              color={COLORS.gray600}
              onPress={openMenu}
              accessibilityLabel={t("common.more_actions")}
            />
          ) : null
        }
      />

      <SheetScrollView
        ref={bodyRef}
        style={{ flex: 1 }}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="always"
        contentContainerStyle={{
          paddingHorizontal: fullBleed ? 0 : 24,
          paddingTop: fullBleed ? 0 : 24,
          paddingBottom: 48,
        }}
      >
        {bodyReady ? children : null}
      </SheetScrollView>

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
