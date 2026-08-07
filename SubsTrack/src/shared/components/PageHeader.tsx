import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { COLORS } from "@/src/shared/constants";
import { PressableOpacity } from "./PressableOpacity/PressableOpacity";
import { BranchSelector } from "./BranchSelector";
import { SelectionBar, type SelectionAction } from "./SelectionBar";
import { QuickActionsMenuButton } from "./QuickActionsMenuButton";

// Re-exported so existing importers keep working after the toolbar moved out.
export type { SelectionAction } from "./SelectionBar";

export interface PageHeaderSelection {
  active: boolean;
  count: number;
  actions: SelectionAction[];
  onClose: () => void;
  /** True when every visible row is selected — drives the leading checkbox. */
  allSelected?: boolean;
  /** Selects every visible row when not all selected; clears them when all are. */
  onToggleAll?: () => void;
}

/** A screen-specific icon button in the header, next to the quick-actions menu. */
export interface PageHeaderIconAction {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Used as the accessibility label — the header renders the icon only. */
  label: string;
  onPress: () => void;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  actionLabel?: string;
  onAction?: () => void;
  /** Icon buttons for THIS screen, rendered before the branch chip. */
  iconActions?: PageHeaderIconAction[];
  hideBranchSelector?: boolean;
  /** Hides the top-right quick-actions (3-dot) menu on this screen. */
  hideQuickActions?: boolean;
  /** When `selection.active`, the whole header is replaced by a selection toolbar. */
  selection?: PageHeaderSelection;
}

export function PageHeader({
  title,
  subtitle,
  showBack,
  onBack,
  actionLabel,
  onAction,
  iconActions,
  hideBranchSelector,
  hideQuickActions,
  selection,
}: PageHeaderProps) {
  const selecting = selection?.active ?? false;

  // The normal header stays mounted while selecting so its (taller) height is
  // preserved and the list never shifts up; the selection toolbar overlays it.
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
        {actionLabel && onAction ? (
          <PressableOpacity
            onPress={onAction}
            className="bg-primary rounded-full px-4 py-2"
          >
            <Text className="text-white font-semibold text-sm">
              {actionLabel}
            </Text>
          </PressableOpacity>
        ) : null}
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

