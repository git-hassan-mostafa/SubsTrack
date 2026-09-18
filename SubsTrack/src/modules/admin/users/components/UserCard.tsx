import { View } from "react-native";
import {
  CardChips,
  CardSubtitle,
  CardTitle,
} from "@/src/shared/components/CardText";
import { Chip, type ChipTone } from "@/src/shared/components/Chip";
import type { AppUser } from "@/src/core/types";
import { useTranslation } from "react-i18next";
import { EntityCard } from "@/src/shared/components/EntityCard";
import { COLORS } from "@/src/shared/constants";

interface Props {
  user: AppUser;
  onEdit: (user: AppUser) => void;
  onMenu: (user: AppUser) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (user: AppUser) => void;
  onEnterSelection?: (user: AppUser) => void;
}

const roleBadgeStyle: Record<string, { tone: ChipTone; label: string }> = {
  admin: { tone: "indigo", label: "Admin" },
  user: { tone: "teal", label: "Staff" },
  superadmin: { tone: "violet", label: "Super" },
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
      icon="person-outline"
      iconColor={COLORS.success}
      iconBgClassName="bg-success-light"
      dimmed={!user.active}
      onPress={() => onEdit(user)}
      onMenu={() => onMenu(user)}
      selectionMode={selectionMode}
      selected={selected}
      onToggleSelect={() => onToggleSelect?.(user)}
      onEnterSelection={
        onEnterSelection ? () => onEnterSelection(user) : undefined
      }
    >
      <View className="flex-1 me-2">
        <CardTitle numberOfLines={1}>{user.fullName}</CardTitle>
        <CardSubtitle className="mt-0.5" numberOfLines={1}>
          @{user.username}
          {user.phoneNumber ? ` · ${user.phoneNumber}` : ""}
        </CardSubtitle>
        <CardChips>
          <Chip
            text={t(`users.${badge.label.toLowerCase()}`)}
            tone={badge.tone}
          />
          {!user.active ? (
            <Chip text={t("common.inactive")} tone="gray" />
          ) : null}
        </CardChips>
      </View>
    </EntityCard>
  );
}
