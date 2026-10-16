import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { AppBottomSheet } from "@/src/shared/components/AppBottomSheet";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { SheetHeader } from "@/src/shared/components/SheetHeader";
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
        <SheetHeader title={t("ledger.history_title")} onClose={onDismiss} />

        <View className="flex-1">
          <CollectionsPanel onOpenSale={onOpenSale} inSheet />
        </View>
      </ResponsiveContainer>
    </AppBottomSheet>
  );
}
