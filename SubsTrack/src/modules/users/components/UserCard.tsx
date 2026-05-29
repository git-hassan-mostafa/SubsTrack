import { View } from "react-native";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import type { AppUser } from "@/src/core/types";
import { AVATAR_COLORS, COLORS } from "../../../shared/constants";
import { useTranslation } from "react-i18next";

interface Props {
  user: AppUser;
  onEdit: (user: AppUser) => void;
  onMenu: (user: AppUser) => void;
}

function getAvatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const roleBadgeStyle: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  admin: { bg: "bg-indigo-100", text: "text-indigo-700", label: "Admin" },
  user: { bg: "bg-gray-100", text: "text-gray-600", label: "Staff" },
  superadmin: { bg: "bg-purple-100", text: "text-purple-700", label: "Super" },
};

export function UserCard({ user, onEdit, onMenu }: Props) {
  const avatarColor = getAvatarColor(user.fullName);
  const badge = roleBadgeStyle[user.role] ?? roleBadgeStyle.user;
  const { t } = useTranslation();

  return (
    <PressableOpacity
      onPress={() => onEdit(user)}
      onLongPress={() => onMenu(user)}
      className="bg-white border border-gray-100 rounded-2xl px-4 py-3.5 mb-2.5"
    >
      <View className="flex-row items-center">
        {/* Avatar */}
        <View className="relative me-3">
          <View
            className="w-11 h-11 rounded-xl items-center justify-center"
            style={{ backgroundColor: avatarColor + "22" }}
          >
            <Text
              className="text-sm"
              fontWeight="Bold"
              style={{ color: avatarColor }}
            >
              {getInitials(user.fullName)}
            </Text>
          </View>
        </View>

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

        <PressableOpacity
          onPress={() => onMenu(user)}
          hitSlop={8}
          className="ms-2 w-9 h-9 items-center justify-center rounded-full"
        >
          <Ionicons name="ellipsis-vertical" size={20} color={COLORS.gray600} />
        </PressableOpacity>
      </View>
    </PressableOpacity>
  );
}
