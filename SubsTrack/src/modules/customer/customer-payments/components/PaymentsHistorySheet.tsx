import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { AppBottomSheet } from "@/src/shared/components/AppBottomSheet";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { useAfterFirstFrame } from "@/src/shared/hooks/useAfterFirstFrame";
import { PaymentsPanel } from "../screens/PaymentsPanel";

interface Props {
  onDismiss: () => void;
}

// The full payments-history list (formerly the Transactions "Payments" tab),
// hosted in a full-height bottom sheet launched from the quick-actions menu.
// Builds on AppBottomSheet directly (not FormSheet) because the panel owns its
// own SectionList body — a scroll container would fight it.
export function PaymentsHistorySheet({ onDismiss }: Props) {
  const { t } = useTranslation();
  // The panel is a whole screen with its own list — keep it off the open path.
  const bodyReady = useAfterFirstFrame();

  return (
    <AppBottomSheet visible onDismiss={onDismiss} variant="full">
      <ResponsiveContainer className="flex-1">
        <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
          <Text fontWeight="Bold" className="text-lg text-gray-900">
            {t("transactions.tab_payments")}
          </Text>
          <PressableOpacity onPress={onDismiss}>
            <Text className="text-base text-primary font-medium">
              {t("common.close")}
            </Text>
          </PressableOpacity>
        </View>

        {bodyReady ? <PaymentsPanel /> : null}
      </ResponsiveContainer>
    </AppBottomSheet>
  );
}
