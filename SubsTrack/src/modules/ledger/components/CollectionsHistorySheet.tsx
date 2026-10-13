import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { AppBottomSheet } from "@/src/shared/components/AppBottomSheet";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { CollectionsPanel } from "../screens/CollectionsPanel";

interface Props {
  onDismiss: () => void;
  onOpenSale?: (saleId: string) => Promise<void> | void;
}

// not a FormSheet: a paging list inside its scroll view would page to the end
export function CollectionsHistorySheet({ onDismiss, onOpenSale }: Props) {
  const { t } = useTranslation();
  return (
    <AppBottomSheet
      visible
      onDismiss={onDismiss}
      variant="full"
      dismissOnBackdropPress={false}
    >
      <ResponsiveContainer className="flex-1">
        <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
          <Text fontWeight="Bold" className="flex-1 me-3 text-lg text-gray-900">
            {t("ledger.history_title")}
          </Text>
          <PressableOpacity onPress={onDismiss}>
            <Text fontWeight="Medium" className="text-base text-primary">
              {t("common.close")}
            </Text>
          </PressableOpacity>
        </View>

        <View className="flex-1">
          <CollectionsPanel onOpenSale={onOpenSale} inSheet />
        </View>
      </ResponsiveContainer>
    </AppBottomSheet>
  );
}
