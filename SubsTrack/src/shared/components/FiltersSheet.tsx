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
      <View className="flex-row items-center justify-between px-5 py-3 border-b border-gray-100">
        <Text fontWeight="SemiBold" className="text-base text-gray-900">
          {t("filters.title")}
        </Text>
        <PressableOpacity onPress={onDismiss} hitSlop={8}>
          <Text fontWeight="Medium" className="text-base text-primary">
            {t("common.close")}
          </Text>
        </PressableOpacity>
      </View>

      <SheetScrollView
        keyboardShouldPersistTaps="handled"
        style={{ maxHeight: Math.round(height * BODY_MAX_HEIGHT_RATIO) }}
        contentContainerStyle={{ padding: 16, gap: 20 }}
      >
        {showBranch ? <BranchFilterCard /> : null}
        {filters ? (
          <View className="gap-y-3">
            {showBranch ? (
              <Text
                fontWeight="SemiBold"
                className="text-xs text-gray-500 uppercase tracking-wide"
              >
                {t("filters.this_list_title")}
              </Text>
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
            className={`flex-row items-center justify-center gap-x-1.5 rounded-xl border border-gray-200 py-3 ${
              filters.active ? "" : "opacity-40"
            }`}
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
