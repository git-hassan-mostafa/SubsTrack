import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { COLORS } from "@/src/shared/constants";
import { PressableOpacity } from "./PressableOpacity";
import { BranchSelector } from "./BranchSelector";

export interface SelectionAction {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Used as the accessibility label — the toolbar renders icons only. */
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface PageHeaderSelection {
  active: boolean;
  count: number;
  actions: SelectionAction[];
  onClose: () => void;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  actionLabel?: string;
  onAction?: () => void;
  hideBranchSelector?: boolean;
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
  hideBranchSelector,
  selection,
}: PageHeaderProps) {
  if (selection?.active) {
    return <SelectionToolbar {...selection} />;
  }

  return (
    <View className="flex-row items-start px-4 pt-4 pb-4 bg-white border-b border-gray-100 gap-2">
      {showBack ? (
        <PressableOpacity onPress={onBack} className="p-1 me-1">
          <DirectionalIcon
            name="chevron-back"
            size={22}
            color={COLORS.primary}
          />
        </PressableOpacity>
      ) : null}
      <View className="flex-1 min-w-0">
        <Text fontWeight="Bold" className="text-2xl text-gray-900">
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-sm text-gray-400 mt-0.5">{subtitle}</Text>
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
      {!hideBranchSelector && <BranchSelector className="self-start" />}
    </View>
  );
}

function SelectionToolbar({
  count,
  actions,
  onClose,
}: PageHeaderSelection) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center px-4 pt-4 pb-4 bg-white border-b border-gray-100 gap-2">
      <PressableOpacity onPress={onClose} className="p-1 me-1" hitSlop={8}>
        <Ionicons name="close" size={24} color={COLORS.gray700} />
      </PressableOpacity>
      <View className="flex-1 min-w-0">
        <Text fontWeight="Bold" className="text-lg text-gray-900">
          {t("common.selected_count", { count })}
        </Text>
      </View>
      <View className="flex-row items-center gap-1">
        {actions.map((action) => (
          <PressableOpacity
            key={action.key}
            onPress={action.onPress}
            disabled={action.disabled}
            hitSlop={8}
            accessibilityLabel={action.label}
            className={`w-10 h-10 items-center justify-center rounded-full ${
              action.disabled ? "opacity-40" : ""
            }`}
          >
            <Ionicons
              name={action.icon}
              size={22}
              color={action.destructive ? COLORS.danger : COLORS.gray700}
            />
          </PressableOpacity>
        ))}
      </View>
    </View>
  );
}
