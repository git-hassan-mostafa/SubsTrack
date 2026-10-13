import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { COLORS } from "@/src/shared/constants";
import { PressableOpacity } from "./PressableOpacity";
import SearchTextBox from "./SearchTextBox";
import { HeaderFilterButton } from "./HeaderFilterButton";
import type { ListFilters } from "./FiltersSheet";
import { SelectionBar, type SelectionAction } from "./SelectionBar";
import { QuickActionsMenuButton } from "./QuickActionsMenuButton";
import { sortActions, type ActionGroup } from "@shared/shared/lib/actionOrder";

export type { SelectionAction } from "./SelectionBar";
export type { ListFilters } from "./FiltersSheet";

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
  group?: ActionGroup;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

// The page owns the text; closing the box clears it so no hidden search remains.
export interface PageHeaderSearch {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  iconActions?: PageHeaderIconAction[];
  search?: PageHeaderSearch;
  filters?: ListFilters;
  hideBranchSelector?: boolean;
  hideQuickActions?: boolean;
  selection?: PageHeaderSelection;
}

export type PageHeaderTools = Pick<
  PageHeaderProps,
  "subtitle" | "search" | "filters" | "selection"
>;

// A tab panel draws its host's header with its own search, filters and selection.
export type RenderPageHeader = (tools: PageHeaderTools) => ReactNode;

export function PageHeader({
  title,
  subtitle,
  showBack,
  onBack,
  iconActions,
  search,
  filters,
  hideBranchSelector,
  hideQuickActions,
  selection,
}: PageHeaderProps) {
  const { t } = useTranslation();
  const selecting = selection?.active ?? false;
  const [searchOpen, setSearchOpen] = useState(!!search?.value);
  const searching = !!search && searchOpen;

  function closeSearch() {
    search?.onChange("");
    setSearchOpen(false);
  }

  const covered = selecting || searching;

  return (
    <View className="relative">
      <View
        className={`flex-row items-center px-4 py-2 min-h-14 bg-white border-b border-gray-100 gap-2 ${
          covered ? "opacity-0" : ""
        }`}
        pointerEvents={covered ? "none" : "auto"}
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
        <View className="flex-1 min-w-0">
          <Text
            fontWeight="Bold"
            className="text-lg text-gray-900"
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-xs text-gray-500" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {search ? (
          <PressableOpacity
            onPress={() => setSearchOpen(true)}
            className="p-1"
            hitSlop={8}
            accessibilityLabel={t("filters.open_search")}
          >
            <Ionicons name="search-outline" size={22} color={COLORS.gray700} />
          </PressableOpacity>
        ) : null}
        <HeaderFilterButton filters={filters} hideBranch={hideBranchSelector} />
        {sortActions(iconActions ?? []).map((action) => (
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
        {!hideQuickActions && <QuickActionsMenuButton />}
      </View>
      {search && searchOpen && !selecting ? (
        <View className="absolute inset-0 flex-row items-center gap-2 px-4 bg-white border-b border-gray-100">
          <View className="flex-1">
            <SearchTextBox
              searchText={search.value}
              setSearchText={search.onChange}
              placeholder={search.placeholder}
              autoFocus
            />
          </View>
          <PressableOpacity
            onPress={closeSearch}
            className="p-1"
            hitSlop={8}
            accessibilityLabel={t("filters.close_search")}
          >
            <Ionicons name="close" size={24} color={COLORS.gray700} />
          </PressableOpacity>
        </View>
      ) : null}
      {selection?.active ? (
        <View className="absolute inset-0">
          <SelectionBar
            count={selection.count}
            actions={selection.actions}
            onClose={selection.onClose}
            allSelected={selection.allSelected}
            onToggleAll={selection.onToggleAll}
            className="flex-1"
          />
        </View>
      ) : null}
    </View>
  );
}
