import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { AppBottomSheet } from "@/src/shared/components/AppBottomSheet";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { SheetDragArea } from "@/src/shared/components/SheetDragArea";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { CollectionsPanel } from "../screens/CollectionsPanel";

interface Props {
  onDismiss: () => void;
  onOpenSale?: (saleId: string) => Promise<void> | void;
}

/**
 * The money-in history as a sheet — the quick-actions entry point.
 *
 * One component replaces the payments history AND the debt-payments history:
 * there is a single stream of hand-overs now, whatever they settled.
 *
 * Deliberately NOT a `FormSheet`: that wraps its children in a
 * `BottomSheetScrollView`, and a paging list nested in a scroll view is handed
 * unbounded height — it renders every row, measures itself as fully visible and
 * pages to the end without anyone scrolling. The list must BE the scroller.
 */
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
        <SheetDragArea className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
          <Text fontWeight="Bold" className="flex-1 me-3 text-lg text-gray-900">
            {t("ledger.history_title")}
          </Text>
          <PressableOpacity onPress={onDismiss}>
            <Text fontWeight="Medium" className="text-base text-primary">
              {t("common.close")}
            </Text>
          </PressableOpacity>
        </SheetDragArea>

        <View className="flex-1">
          <CollectionsPanel onOpenSale={onOpenSale} inSheet />
        </View>
      </ResponsiveContainer>
    </AppBottomSheet>
  );
}
