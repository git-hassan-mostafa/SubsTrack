import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { Dropdown, type DropdownOption } from "./Dropdown";
import {
  BRANCH_FILTER_UNASSIGNED,
  type BranchFilter,
} from "@shared/core/constants";
import { COLORS } from "@/src/shared/constants";
import { useUiPrefStore } from "@shared/shared/lib/uiPrefStore";
import { useActiveBranches } from "@shared/modules/admin/branches/hooks/useActiveBranches";

// App-wide branch (null = all, UNASSIGNED = no branch) — not one page's filter.
export function BranchFilterCard() {
  const { t } = useTranslation();
  const activeBranches = useActiveBranches();
  const currentBranchId = useUiPrefStore((s) => s.currentBranchId);
  const setCurrentBranchId = useUiPrefStore((s) => s.setCurrentBranchId);

  const options: DropdownOption<BranchFilter>[] = [
    ...activeBranches.map((b) => ({
      value: b.id as BranchFilter,
      label: b.name,
    })),
    { value: BRANCH_FILTER_UNASSIGNED, label: t("branches.unassigned") },
  ];

  return (
    <View className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
      <View className="flex-row items-center gap-x-2">
        <View className="w-8 h-8 rounded-lg bg-white items-center justify-center">
          <Ionicons name="git-branch-outline" size={16} color={COLORS.primary} />
        </View>
        <Text fontWeight="SemiBold" className="flex-1 text-sm text-gray-900">
          {t("filters.branch_title")}
        </Text>
      </View>
      <View className="flex-row mt-3">
        <Dropdown<BranchFilter>
          label={t("branches.branch_label")}
          options={options}
          value={currentBranchId}
          onChange={setCurrentBranchId}
          nullable
          nullLabel={t("branches.all_branches")}
          triggerStyle="filter"
          searchable
        />
      </View>
      <View className="flex-row items-start gap-x-1.5 mt-2.5">
        <Ionicons
          name="information-circle-outline"
          size={14}
          color={COLORS.gray500}
          style={{ marginTop: 2 }}
        />
        <Text className="flex-1 text-xs text-gray-500">
          {t("filters.branch_hint")}
        </Text>
      </View>
    </View>
  );
}
