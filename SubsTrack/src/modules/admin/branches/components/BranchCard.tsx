import { View } from "react-native";
import { useTranslation } from "react-i18next";
import type { Branch } from "@/src/core/types";
import { Text } from "@/src/shared/components/Text";
import { EntityCard } from "@/src/shared/components/EntityCard";

interface Props {
  branch: Branch;
  onEdit: (branch: Branch) => void;
  onMenu: (branch: Branch) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (branch: Branch) => void;
  onEnterSelection?: (branch: Branch) => void;
}

export function BranchCard({
  branch,
  onEdit,
  onMenu,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onEnterSelection,
}: Props) {
  const { t } = useTranslation();
  return (
    <EntityCard
      icon="business-outline"
      dimmed={!branch.active}
      onPress={() => onEdit(branch)}
      onMenu={() => onMenu(branch)}
      selectionMode={selectionMode}
      selected={selected}
      onToggleSelect={() => onToggleSelect?.(branch)}
      onEnterSelection={
        onEnterSelection ? () => onEnterSelection(branch) : undefined
      }
    >
      <View className="flex-1">
        <View className="flex-row items-center">
          <Text className="text-base font-semibold text-gray-900">
            {branch.name}
          </Text>
          {!branch.active ? (
            <View className="bg-gray-100 rounded-lg px-2 py-0.5 ms-2">
              <Text className="text-[10px] font-semibold text-gray-500 uppercase">
                {t("common.inactive")}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </EntityCard>
  );
}
