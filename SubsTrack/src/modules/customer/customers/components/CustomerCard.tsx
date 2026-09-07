import { memo } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import type { TFunction } from "i18next";
import type { Customer, CustomerStatus } from "@/src/core/types";
import { COLORS } from "../../../../shared/constants";
import {
  EntityCard,
  type EntityCardFlag,
} from "@/src/shared/components/EntityCard";
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

const FLAG_STYLES: Record<
  CustomerFlag,
  {
    label: (t: TFunction, s: CustomerStatus) => string;
    className: string;
  }
> = {
  paid: {
    label: (t) => `✓ ${t("common.paid")}`,
    className: "bg-green-500 text-white",
  },
  mixed: {
    label: (t, s) =>
      t("customers.plans_paid_count", {
        paid: s.planCount.paid,
        total: s.planCount.total,
      }),
    className: "bg-amber-500 text-white",
  },
  unpaid: {
    label: (t) => t("dashboard.unpaid"),
    className: "bg-red-500 text-white",
  },
  skipped: {
    label: (t) => t("payments.skip.skipped_label"),
    className: "bg-slate-400 text-white",
  },
  not_due_yet: {
    label: (t) => t("payments.not_due_yet_label"),
    className: "bg-gray-400 text-white",
  },
  overdue: {
    label: (t) => t("customers.overdue"),
    className: "bg-red-500 text-white",
  },
};

// Inactive and non-regular REPLACE the payment flags; debt always rides along.
function buildFlags(
  customer: Customer,
  status: CustomerStatus | null,
  debtLabel: string | null,
  t: TFunction,
): EntityCardFlag[] {
  const flags: EntityCardFlag[] = [];

  if (!customer.active) {
    flags.push({
      key: "inactive",
      text: t("common.inactive"),
      className: "bg-gray-400 text-white",
    });
  } else if (!customer.isRegular) {
    flags.push({
      key: "non_regular",
      text: t("customers.non_regular"),
      className: "bg-amber-500 text-white",
    });
  } else if (status) {
    for (const flag of customerFlags(status)) {
      const style = FLAG_STYLES[flag];
      flags.push({
        key: flag,
        text: style.label(t, status),
        className: style.className,
      });
    }
  }

  if (debtLabel) {
    flags.push({
      key: "debt",
      text: `${t("customers.debt")} ${debtLabel}`,
      className: "bg-red-500 text-white",
    });
  }

  return flags;
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

  // Summarize the customer's active service lines: the single line's label/plan,
  // or "N plans" when they hold several.
  const activeLines = (customer.customerPlans ?? []).filter((l) => l.active);
  const planSummary =
    activeLines.length === 0
      ? t("common.no_plan")
      : activeLines.length === 1
        ? activeLines[0].plan?.name || t("common.no_plan")
        : t("subscriptions.count_plans", { count: activeLines.length });

  const flags = buildFlags(customer, status, debtLabel, t);

  return (
    <EntityCard
      icon="person-outline"
      flags={flags}
      reserveFlagSpace
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
          <Text
            className="flex-1 text-base font-semibold text-gray-900"
            numberOfLines={1}
          >
            {customer.name}
          </Text>
          <Text className="text-xs text-gray-400">{planSummary}</Text>
        </View>
        {!!customer.phoneNumber && (
          <View className="flex-row items-center mt-1">
            <Ionicons name="call" size={12} color={COLORS.gray400} />
            <Text className="text-xs text-gray-400 ms-1" numberOfLines={1}>
              {customer.phoneNumber}
            </Text>
          </View>
        )}
      </View>
    </EntityCard>
  );
});
