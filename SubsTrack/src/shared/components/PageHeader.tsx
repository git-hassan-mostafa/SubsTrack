import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { COLORS } from "@/src/shared/constants";
import { PressableOpacity } from "./PressableOpacity/PressableOpacity";
import { BranchSelector } from "./BranchSelector";
import { SelectionBar, type SelectionAction } from "./SelectionBar";
import { QuickActionsMenuButton } from "./QuickActionsMenuButton";

export type { SelectionAction } from "./SelectionBar";

export interface PageHeaderSelection {
  active: boolean;
  count: number;
  actions: SelectionAction[];
  onClose: () => void;
  allSelected?: boolean;
  onToggleAll?: () => void;
}

/** A screen-specific icon button in the header, next to the quick-actions menu. */
export interface PageHeaderIconAction {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  iconActions?: PageHeaderIconAction[];
  hideBranchSelector?: boolean;
  hideQuickActions?: boolean;
  selection?: PageHeaderSelection;
}

export function PageHeader({
  title,
  subtitle,
  showBack,
  onBack,
  iconActions,
  hideBranchSelector,
  hideQuickActions,
  selection,
}: PageHeaderProps) {
  const selecting = selection?.active ?? false;

  return (
    <View className="relative">
      <View
        className={`flex-row items-center px-4 pt-2 pb-2 bg-white border-b border-gray-100 gap-2 ${
          selecting ? "opacity-0" : ""
        }`}
        pointerEvents={selecting ? "none" : "auto"}
      >
        {showBack ? (
          <PressableOpacity onPress={onBack} className="p-1 me-1">
            <DirectionalIcon
              name="chevron-back"
              size={22}
              color={COLORS.primary}
            />
          </PressableOpacity>
        ) : null}
        <View className="flex-1 min-w-0 flex items-center flex-row gap-4">
          <Text fontWeight="Bold" className="text-lg text-gray-900">
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-xs text-gray-400">{subtitle}</Text>
          ) : null}
        </View>
        {iconActions?.map((action) => (
          <PressableOpacity
            key={action.key}
            onPress={action.onPress}
            className="p-1"
            hitSlop={8}
            accessibilityLabel={action.label}
          >
            <Ionicons name={action.icon} size={22} color={COLORS.gray700} />
          </PressableOpacity>
        ))}
        {/* No `self-start`: the row is `items-center`, so the chip must center
            with the title and the 3-dot button instead of hugging the top. */}
        {!hideBranchSelector && <BranchSelector className="" />}
        {!hideQuickActions && <QuickActionsMenuButton />}
      </View>
      {selection?.active ? (
        <View className="absolute inset-0">
          <SelectionBar
            count={selection.count}
            actions={selection.actions}
            onClose={selection.onClose}
            allSelected={selection.allSelected}
            onToggleAll={selection.onToggleAll}
          />
        </View>
      ) : null}
    </View>
  );
}
