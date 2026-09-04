import { memo } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import type { TFunction } from "i18next";
import type { Customer, CustomerStatus } from "@/src/core/types";
import { COLORS } from "../../../../shared/constants";
import { EntityCard } from "@/src/shared/components/EntityCard";
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
    textClassName: string;
    bgClassName: string;
  }
> = {
  paid: {
    label: (t) => `✓ ${t("common.paid")}`,
    textClassName: "text-green-700",
    bgClassName: "bg-green-100",
  },
  mixed: {
    label: (t, s) =>
      t("customers.plans_paid_count", {
        paid: s.planCount.paid,
        total: s.planCount.total,
      }),
    textClassName: "text-amber-600",
    bgClassName: "bg-amber-100",
  },
  unpaid: {
    label: (t) => t("dashboard.unpaid"),
    textClassName: "text-red-500",
    bgClassName: "bg-red-100",
  },
  skipped: {
    label: (t) => t("payments.skip.skipped_label"),
    textClassName: "text-slate-600",
    bgClassName: "bg-slate-200",
  },
  not_due_yet: {
    label: (t) => t("payments.not_due_yet_label"),
    textClassName: "text-gray-500",
    bgClassName: "bg-gray-100",
  },
  overdue: {
    label: (t) => t("customers.overdue"),
    textClassName: "text-red-600",
    bgClassName: "bg-red-100",
  },
};

// Pill props for each flag this customer wears, in the helper's display order.
function flagPills(status: CustomerStatus, t: TFunction) {
  return customerFlags(status).map((flag) => {
    const style = FLAG_STYLES[flag];
    return { ...style, key: flag, text: style.label(t, status) };
  });
}

// A single pill badge. Rendered on the card's top flags row.
function Flag({
  text,
  textClassName,
  bgClassName,
}: {
  text: string;
  textClassName: string;
  bgClassName: string;
}) {
  return (
    <View className={`rounded-lg px-2 py-0.5 ${bgClassName}`}>
      <Text className={`text-xs font-semibold ${textClassName}`}>{text}</Text>
    </View>
  );
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

  const flags = status ? flagPills(status, t) : [];

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
        {/* Flags — their own line at the top right of the card. The min height
            keeps the row from collapsing while the status is still loading. */}
        <View className="flex-row items-center justify-end gap-1.5 mb-1 min-h-[20px]">
          {!customer.active ? (
            <Flag
              text={t("common.inactive")}
              textClassName="text-gray-500"
              bgClassName="bg-gray-100"
            />
          ) : !customer.isRegular ? (
            <Flag
              text={t("customers.non_regular")}
              textClassName="text-amber-600"
              bgClassName="bg-amber-100"
            />
          ) : (
            flags.map((flag) => (
              <Flag
                key={flag.key}
                text={flag.text}
                textClassName={flag.textClassName}
                bgClassName={flag.bgClassName}
              />
            ))
          )}

          {/* Debt flag — shown whenever the customer has a net outstanding debt. */}
          {debtLabel ? (
            <Flag
              text={`${t("customers.debt")} ${debtLabel}`}
              textClassName="text-red-600"
              bgClassName="bg-red-100"
            />
          ) : null}
        </View>

        {/* Name + Date on one line */}
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
