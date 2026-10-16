import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { COLORS } from "@/src/shared/constants";
import { PressableOpacity } from "./PressableOpacity";
import { IconButton } from "./IconButton";
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
        className={`flex-row items-center ${showBack ? "ps-1" : "ps-4"} pe-1 py-1 min-h-16 bg-gray-50 ${
          covered ? "opacity-0" : ""
        }`}
        pointerEvents={covered ? "none" : "auto"}
      >
        {showBack ? (
          <PressableOpacity
            onPress={onBack}
            ripple="borderless"
            accessibilityRole="button"
            accessibilityLabel={t("common.go_back")}
            className="w-12 h-12 items-center justify-center me-1"
          >
            <DirectionalIcon
              name="arrow-back"
              size={24}
              color={COLORS.gray900}
            />
          </PressableOpacity>
        ) : null}
        <View className="flex-1 min-w-0 me-1">
          <Text
            fontWeight="SemiBold"
            className="text-[22px] text-gray-900"
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-sm text-gray-500" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {search ? (
          <IconButton
            icon="search-outline"
            onPress={() => setSearchOpen(true)}
            accessibilityLabel={t("filters.open_search")}
          />
        ) : null}
        <HeaderFilterButton filters={filters} hideBranch={hideBranchSelector} />
        {sortActions(iconActions ?? []).map((action) => (
          <IconButton
            key={action.key}
            icon={action.icon}
            onPress={action.onPress}
            accessibilityLabel={action.label}
          />
        ))}
        {!hideQuickActions && <QuickActionsMenuButton />}
      </View>
      {search && searchOpen && !selecting ? (
        <View className="absolute inset-0 flex-row items-center gap-1 ps-3 pe-1 bg-gray-50">
          <View className="flex-1">
            <SearchTextBox
              searchText={search.value}
              setSearchText={search.onChange}
              placeholder={search.placeholder}
              autoFocus
            />
          </View>
          <IconButton
            icon="close"
            onPress={closeSearch}
            accessibilityLabel={t("filters.close_search")}
          />
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
