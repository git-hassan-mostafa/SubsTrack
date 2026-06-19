import { View } from "react-native";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import type { AppUser } from "@/src/core/types";
import { COLORS } from "../../../shared/constants";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/src/shared/components/Checkbox";

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
    <PressableOpacity
      onPress={() => (selectionMode ? onToggleSelect?.(user) : onEdit(user))}
      onLongPress={
        selectionMode ? undefined : () => (onEnterSelection ?? onMenu)(user)
      }
      className="bg-white border border-gray-100 rounded-2xl px-4 py-3.5 mb-2.5"
    >
      <View className="flex-row items-center">
        {/* Avatar — replaced by a checkbox in selection mode */}
        {selectionMode ? (
          <View className="w-11 h-11 items-center justify-center me-3 flex-shrink-0">
            <Checkbox checked={selected} />
          </View>
        ) : (
          <View className="relative me-3">
            <View className="w-10 h-10 rounded-xl bg-success-light items-center justify-center me-3">
              <Ionicons name="person" size={18} color={COLORS.success} />
            </View>
          </View>
        )}

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

        {!selectionMode && (
          <PressableOpacity
            onPress={() => onMenu(user)}
            hitSlop={8}
            className="ms-2 w-9 h-9 items-center justify-center rounded-full"
          >
            <Ionicons
              name="ellipsis-vertical"
              size={20}
              color={COLORS.gray600}
            />
          </PressableOpacity>
        )}
      </View>
    </PressableOpacity>
  );
}
