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
} from "@/src/core/constants";
import { COLORS } from "@/src/shared/constants";
import { useAuthSlice } from "@/src/state/hooks/useAuthSlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { useActiveBranches } from "@/src/modules/branches/hooks/useActiveBranches";
import { useIsMultiBranchActive } from "@/src/modules/branches/hooks/useIsMultiBranchActive";

/**
 * Header branch filter chip for tenant-wide admins. Renders on the top-right of
 * PageHeader on Customers / Plans / Users, and inside the greeting block on
 * Dashboard.
 *
 * Self-conceals (returns null) when:
 *   - There is no logged-in user
 *   - The user is branch-scoped (RLS already pins them to their branch)
 *   - The tenant has fewer than 2 active branches
 *
 * Filter states stored in uiPrefStore.currentBranchId:
 *   null                      → "All Branches" — no filter
 *   <UUID>                    → that specific branch
 *   BRANCH_FILTER_UNASSIGNED  → only rows with branch_id IS NULL
 *
 * `className` styles the container so each call site controls placement
 * (Dashboard keeps the default top margin; PageHeader drops it for the
 * right-aligned slot).
 */
export function BranchSelector({
  className = "mt-2 self-start",
}: {
  className?: string;
}) {
  const { t } = useTranslation();
  const user = useAuthSlice((s) => s.user);
  const activeBranches = useActiveBranches();
  const isMultiBranchActive = useIsMultiBranchActive();
  const currentBranchId = useUiPrefStore((s) => s.currentBranchId);
  const setCurrentBranchId = useUiPrefStore((s) => s.setCurrentBranchId);
  const [open, setOpen] = useState(false);

  if (!user || user.branchId !== null || !isMultiBranchActive) return null;

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
          className={`text-xs font-semibold ${
            isFiltered ? "text-primary" : "text-gray-600"
          }`}
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
