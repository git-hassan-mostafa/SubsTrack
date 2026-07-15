import { memo } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import type { CurrentMonthPlanCount, Customer } from "@/src/core/types";
import { COLORS } from "../../../shared/constants";
import { EntityCard } from "@/src/shared/components/EntityCard";

interface Props {
  customer: Customer;
  paymentStatus: "paid" | "partial" | "unpaid" | "mixed";
  /** For "mixed": how many of the customer's plans are paid this month, out of total. */
  planCount?: CurrentMonthPlanCount | null;
  monthLabel: string;
  /** Formatted net debt (e.g. "150,000 ل.ل"), or null when the customer owes nothing. */
  debtLabel?: string | null;
  onPress: (customer: Customer) => void;
  onMenu: (customer: Customer) => void;
  menuLoading?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (customer: Customer) => void;
  onEnterSelection?: (customer: Customer) => void;
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
  paymentStatus,
  planCount = null,
  monthLabel,
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
        {/* Flags — their own line at the top right of the card. */}
        <View className="flex-row items-center justify-end gap-1.5 mb-1">
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
          ) : paymentStatus === "paid" ? (
            <Flag
              text={`✓ ${t("common.paid")}`}
              textClassName="text-green-700"
              bgClassName="bg-green-100"
            />
          ) : paymentStatus === "mixed" ? (
            <Flag
              text={t("customers.plans_paid_count", {
                paid: planCount?.paid ?? 0,
                total: planCount?.total ?? 0,
              })}
              textClassName="text-amber-600"
              bgClassName="bg-amber-100"
            />
          ) : paymentStatus === "partial" ? (
            <Flag
              text={t("common.partial")}
              textClassName="text-amber-600"
              bgClassName="bg-amber-100"
            />
          ) : (
            <Flag
              text={t("dashboard.unpaid")}
              textClassName="text-red-500"
              bgClassName="bg-red-100"
            />
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
            className="flex-1 text-base font-semibold text-gray-900 me-2"
            numberOfLines={1}
          >
            {customer.name}
          </Text>
          <Text className="text-xs text-gray-400">{monthLabel}</Text>
        </View>

        {/* Plan + phone */}
        <Text className="text-sm text-gray-400 mt-0.5" numberOfLines={1}>
          {planSummary}
        </Text>
        {!!customer.phoneNumber && (
          <View className="flex-row items-center mt-1">
            <Ionicons name="call-outline" size={12} color={COLORS.gray400} />
            <Text className="text-xs text-gray-400 ms-1" numberOfLines={1}>
              {customer.phoneNumber}
            </Text>
          </View>
        )}
      </View>
    </EntityCard>
  );
});
