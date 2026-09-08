import { View } from "react-native";
import { useTranslation } from "react-i18next";
import type { Branch } from "@/src/core/types";
import { CardTitle } from "@/src/shared/components/CardText";
import { Chip } from "@/src/shared/components/Chip";
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
          <CardTitle>{branch.name}</CardTitle>
          {!branch.active ? (
            <View className="ms-2">
              <Chip text={t("common.inactive")} tone="gray" />
            </View>
          ) : null}
        </View>
      </View>
    </EntityCard>
  );
}
