import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { PressableOpacity } from "./PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { DropdownModal, type DropdownOption } from "./Dropdown";
import {
  BRANCH_FILTER_UNASSIGNED,
  type BranchFilter,
} from "@shared/core/constants";
import { COLORS } from "@/src/shared/constants";
import { useUiPrefStore } from "@shared/shared/lib/uiPrefStore";
import { useActiveBranches } from "@shared/modules/admin/branches/hooks/useActiveBranches";
import { useCanPickBranch } from "@shared/modules/admin/branches/hooks/useCanPickBranch";

// Header filter: null = all branches, UNASSIGNED = rows with no branch.
export function BranchSelector({
  className = "mt-2 self-start",
}: {
  className?: string;
}) {
  const { t } = useTranslation();
  const activeBranches = useActiveBranches();
  const canPick = useCanPickBranch();
  const currentBranchId = useUiPrefStore((s) => s.currentBranchId);
  const setCurrentBranchId = useUiPrefStore((s) => s.setCurrentBranchId);
  const [open, setOpen] = useState(false);

  if (!canPick) return null;

  const options: DropdownOption<BranchFilter>[] = [
    ...activeBranches.map((b) => ({
      value: b.id as BranchFilter,
      label: b.name,
    })),
    { value: BRANCH_FILTER_UNASSIGNED, label: t("branches.unassigned") },
  ];

  const allBranchesLabel = t("branches.all_branches");
  const isFiltered = currentBranchId !== null;
  const selectedLabel =
    currentBranchId === null
      ? allBranchesLabel
      : currentBranchId === BRANCH_FILTER_UNASSIGNED
        ? t("branches.unassigned")
        : (activeBranches.find((b) => b.id === currentBranchId)?.name ??
          allBranchesLabel);

  const tint = isFiltered ? COLORS.primary : COLORS.gray600;

  return (
    <View className={className}>
      <PressableOpacity
        onPress={() => setOpen(true)}
        className={`flex-row items-center gap-1.5 rounded-full px-3 py-1 ${
          isFiltered ? "bg-indigo-50" : "bg-gray-100"
        }`}
      >
        <Ionicons name="git-branch-outline" size={12} color={tint} />
        <Text
          fontWeight="SemiBold"
          className={`text-xs ${isFiltered ? "text-primary" : "text-gray-600"}`}
        >
          {selectedLabel}
        </Text>
        <Ionicons name="chevron-down" size={12} color={tint} />
      </PressableOpacity>

      <DropdownModal<BranchFilter>
        visible={open}
        onClose={() => setOpen(false)}
        title={t("branches.branch_label")}
        options={options}
        value={currentBranchId}
        onChange={setCurrentBranchId}
        nullable
        nullLabel={allBranchesLabel}
      />
    </View>
  );
}
