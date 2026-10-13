import { Modal, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { useUnsavedChangesGuard } from "@shared/shared/hooks/useUnsavedChangesGuard";
import {
  sheetBody,
  sheetHeightRatio,
  type AppBottomSheetProps,
} from "@/src/shared/lib/sheetLayout";
import { PressableOpacity } from "./PressableOpacity";
import { SheetContextReset } from "./SheetContextReset";

const WEB_MAX_WIDTH = 768;
const MAX_HEIGHT_RATIO = 0.9;

// a plain modal on web, never dragged — see gotcha #46
export function AppBottomSheet({
  visible,
  onDismiss,
  children,
  variant = "auto",
  scrollable = false,
  dirty = false,
  dismissOnBackdropPress = true,
}: AppBottomSheetProps) {
  const { t } = useTranslation();
  const { height } = useWindowDimensions();
  const [guardedDismiss] = useUnsavedChangesGuard(dirty, onDismiss);

  const ratio = sheetHeightRatio(variant, scrollable);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={guardedDismiss}
    >
      <View className="flex-1 justify-end bg-black/50">
        <PressableOpacity
          onPress={dismissOnBackdropPress ? guardedDismiss : undefined}
          disabled={!dismissOnBackdropPress}
          accessibilityLabel={t("common.close")}
          className="absolute inset-0"
        />
        <View
          className="w-full self-center rounded-t-3xl bg-white"
          style={{
            maxWidth: WEB_MAX_WIDTH,
            maxHeight: Math.round(height * MAX_HEIGHT_RATIO),
            height: ratio === null ? undefined : Math.round(height * ratio),
          }}
        >
          <View className="items-center py-2.5">
            <View className="h-1 w-10 rounded-full bg-gray-300" />
          </View>
          <View className={ratio === null ? undefined : "flex-1"}>
            <SheetContextReset>
              {sheetBody(children, guardedDismiss)}
            </SheetContextReset>
          </View>
        </View>
      </View>
    </Modal>
  );
}
