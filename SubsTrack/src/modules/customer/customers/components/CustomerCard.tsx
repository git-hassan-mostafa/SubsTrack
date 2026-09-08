import { memo } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import {
  CardMeta,
  CardTitle,
} from "@/src/shared/components/CardText";
import type { TFunction } from "i18next";
import type { Customer, CustomerStatus } from "@/src/core/types";
import { COLORS } from "../../../../shared/constants";
import { EntityCard } from "@/src/shared/components/EntityCard";
import { Chip, type ChipTone } from "@/src/shared/components/Chip";
import { customerFlags, type CustomerFlag } from "../utils/customerFlags";

interface Props {
  customer: Customer;
  status: CustomerStatus | null;
  debtLabel?: string | null;
  onPress: (customer: Customer) => void;
  onMenu: (customer: Customer) => void;
  menuLoading?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (customer: Customer) => void;
  onEnterSelection?: (customer: Customer) => void;
}

interface CardChip {
  key: string;
  text: string;
  tone: ChipTone;
}

const FLAG_STYLES: Record<
  CustomerFlag,
  {
    label: (t: TFunction, s: CustomerStatus) => string;
    tone: ChipTone;
  }
> = {
  paid: {
    label: (t) => t("common.paid"),
    tone: "emerald",
  },
  mixed: {
    label: (t, s) =>
      t("customers.plans_paid_count", {
        paid: s.planCount.paid,
        total: s.planCount.total,
      }),
    tone: "amber",
  },
  unpaid: {
    label: (t) => t("dashboard.unpaid"),
    tone: "red",
  },
  skipped: {
    label: (t) => t("payments.skip.skipped_label"),
    tone: "gray",
  },
  not_due_yet: {
    label: (t) => t("payments.not_due_yet_label"),
    tone: "sky",
  },
  overdue: {
    label: (t) => t("customers.overdue"),
    tone: "red",
  },
};

// Inactive and non-regular REPLACE the payment flags; debt always rides along.
function buildChips(
  customer: Customer,
  status: CustomerStatus | null,
  debtLabel: string | null,
  t: TFunction,
): CardChip[] {
  const chips: CardChip[] = [];

  if (!customer.active) {
    chips.push({
      key: "inactive",
      text: t("common.inactive"),
      tone: "gray",
    });
  } else if (!customer.isRegular) {
    chips.push({
      key: "non_regular",
      text: t("customers.non_regular"),
      tone: "indigo",
    });
  } else if (status) {
    for (const flag of customerFlags(status)) {
      const style = FLAG_STYLES[flag];
      chips.push({
        key: flag,
        text: style.label(t, status),
        tone: style.tone,
      });
    }
  }

  if (debtLabel) {
    chips.push({
      key: "debt",
      text: `${t("customers.debt")} ${debtLabel}`,
      tone: "orange",
    });
  }

  return chips;
}

export const CustomerCard = memo(function CustomerCard({
  customer,
  status,
  debtLabel = null,
  onPress,
  onMenu,
  menuLoading = false,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onEnterSelection,
}: Props) {
  const { t } = useTranslation();

  const activeLines = (customer.customerPlans ?? []).filter((l) => l.active);
  const planSummary =
    activeLines.length === 0
      ? t("common.no_plan")
      : activeLines.length === 1
        ? activeLines[0].plan?.name || t("common.no_plan")
        : t("subscriptions.count_plans", { count: activeLines.length });

  const chips = buildChips(customer, status, debtLabel, t);

  return (
    <EntityCard
      icon="person-outline"
      onPress={() => onPress(customer)}
      onMenu={() => onMenu(customer)}
      menuLoading={menuLoading}
      selectionMode={selectionMode}
      selected={selected}
      onToggleSelect={() => onToggleSelect?.(customer)}
      onEnterSelection={
        onEnterSelection ? () => onEnterSelection(customer) : undefined
      }
    >
      <View className="flex-1 me-2">
        <View className="flex-row items-center">
          <CardTitle className="flex-1" numberOfLines={1}>
            {customer.name}
          </CardTitle>
          <CardMeta>{planSummary}</CardMeta>
        </View>
        {!!customer.phoneNumber && (
          <View className="flex-row items-center mt-1">
            <Ionicons name="call" size={12} color={COLORS.gray400} />
            <CardMeta className="ms-1" numberOfLines={1}>
              {customer.phoneNumber}
            </CardMeta>
          </View>
        )}
        <View className="mt-1 flex-row flex-wrap items-center gap-1 min-h-[19px]">
          {chips.map((chip) => (
            <Chip key={chip.key} text={chip.text} tone={chip.tone} />
          ))}
        </View>
      </View>
    </EntityCard>
  );
});
