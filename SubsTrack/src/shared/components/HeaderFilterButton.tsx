import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import { useUiPrefStore } from "@shared/shared/lib/uiPrefStore";
import { useCanPickBranch } from "@shared/modules/admin/branches/hooks/useCanPickBranch";
import { PressableOpacity } from "./PressableOpacity";
import { FiltersSheet, type ListFilters } from "./FiltersSheet";

interface Props {
  filters?: ListFilters;
  hideBranch?: boolean;
}

// The dot = something narrows this list, the app-wide branch included.
export function HeaderFilterButton({ filters, hideBranch = false }: Props) {
  const { t } = useTranslation();
  const canPickBranch = useCanPickBranch();
  const branchPicked = useUiPrefStore((s) => s.currentBranchId !== null);
  const [open, setOpen] = useState(false);

  const showBranch = canPickBranch && !hideBranch;
  if (!showBranch && !filters) return null;

  const narrowed = (showBranch && branchPicked) || !!filters?.active;

  return (
    <>
      <PressableOpacity
        onPress={() => setOpen(true)}
        className="p-1"
        hitSlop={8}
        accessibilityLabel={t("filters.title")}
      >
        <Ionicons
          name="filter-outline"
          size={22}
          color={narrowed ? COLORS.primary : COLORS.gray700}
        />
        {narrowed ? (
          <View className="absolute top-0.5 end-0.5 w-2 h-2 rounded-full bg-amber-500 border border-white" />
        ) : null}
      </PressableOpacity>
      <FiltersSheet
        visible={open}
        onDismiss={() => setOpen(false)}
        showBranch={showBranch}
        filters={filters}
      />
    </>
  );
}
