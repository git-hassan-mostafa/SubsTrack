import { View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import type { AppUser } from "@/src/core/types";
import { COLORS } from "../../../shared/constants";
import { useTranslation } from "react-i18next";
import { EntityCard } from "@/src/shared/components/EntityCard";

interface Props {
  user: AppUser;
  onEdit: (user: AppUser) => void;
  onMenu: (user: AppUser) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (user: AppUser) => void;
  onEnterSelection?: (user: AppUser) => void;
}

const roleBadgeStyle: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  admin: { bg: "bg-indigo-100", text: "text-indigo-700", label: "Admin" },
  user: { bg: "bg-gray-100", text: "text-gray-600", label: "Staff" },
  superadmin: { bg: "bg-purple-100", text: "text-purple-700", label: "Super" },
};

export function UserCard({
  user,
  onEdit,
  onMenu,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onEnterSelection,
}: Props) {
  const badge = roleBadgeStyle[user.role] ?? roleBadgeStyle.user;
  const { t } = useTranslation();

  return (
    <EntityCard
      icon="person"
      iconColor={COLORS.success}
      iconBgClassName="bg-success-light"
      onPress={() => onEdit(user)}
      onMenu={() => onMenu(user)}
      selectionMode={selectionMode}
      selected={selected}
      onToggleSelect={() => onToggleSelect?.(user)}
      onEnterSelection={
        onEnterSelection ? () => onEnterSelection(user) : undefined
      }
    >
      {/* Name + handle + phone */}
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-base font-semibold text-gray-900">
            {user.fullName}
          </Text>
          {!user.active && (
            <View className="rounded-full px-2 py-0.5 bg-red-100">
              <Text className="text-xs font-semibold text-red-600">
                {t("users.inactive")}
              </Text>
            </View>
          )}
        </View>
        <Text className="text-xs text-gray-400 mt-0.5">
          @{user.username}
          {user.phoneNumber ? ` · ${user.phoneNumber}` : ""}
        </Text>
      </View>

      {/* Role badge */}
      <View className={`rounded-full px-3 py-1 ${badge.bg}`}>
        <Text className={`text-xs font-semibold ${badge.text}`}>
          {t(`users.${badge.label.toLowerCase()}`)}
        </Text>
      </View>
    </EntityCard>
  );
}
