import type { ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { SheetScrollView } from "./SheetScrollComponents";
import { PressableOpacity } from "./PressableOpacity";
import { BottomSheetScaffold } from "./BottomSheetScaffold";
import { BranchFilterCard } from "./BranchFilterCard";
import { SheetHeader } from "./SheetHeader";
import { SectionLabel } from "./SectionLabel";

const BODY_MAX_HEIGHT_RATIO = 0.7;

// One list's own filters: `children` = FilterRows, applied live as they change.
export interface ListFilters {
  active: boolean;
  onClear: () => void;
  children: ReactNode;
}

interface Props {
  visible: boolean;
  onDismiss: () => void;
  showBranch: boolean;
  filters?: ListFilters;
}

export function FiltersSheet({ visible, onDismiss, showBranch, filters }: Props) {
  const { t } = useTranslation();
  const { height } = useWindowDimensions();

  return (
    <BottomSheetScaffold visible={visible} onDismiss={onDismiss}>
      <SheetHeader title={t("filters.title")} onClose={onDismiss} />

      <SheetScrollView
        keyboardShouldPersistTaps="handled"
        style={{ maxHeight: Math.round(height * BODY_MAX_HEIGHT_RATIO) }}
        contentContainerStyle={{ padding: 16, gap: 20 }}
      >
        {showBranch ? <BranchFilterCard /> : null}
        {filters ? (
          <View className="gap-y-3">
            {showBranch ? (
              <SectionLabel className="">
                {t("filters.this_list_title")}
              </SectionLabel>
            ) : null}
            {filters.children}
          </View>
        ) : null}
      </SheetScrollView>

      {filters ? (
        <View className="px-4 pt-2 pb-4 border-t border-gray-100">
          <PressableOpacity
            onPress={filters.onClear}
            disabled={!filters.active}
            containerClassName={`rounded-full border border-gray-300 ${
              filters.active ? "" : "opacity-40"
            }`}
            className="flex-row items-center justify-center gap-x-1.5 min-h-12 py-3"
          >
            <Ionicons name="close" size={16} color={COLORS.gray700} />
            <Text fontWeight="Medium" className="text-sm text-gray-700">
              {t("common.clear_filters")}
            </Text>
          </PressableOpacity>
        </View>
      ) : null}
    </BottomSheetScaffold>
  );
}
