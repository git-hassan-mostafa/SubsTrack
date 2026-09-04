import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { PlanPicker } from "@/src/shared/components/PlanPicker";
import { COLORS } from "@/src/shared/constants";
import type { Currency, Plan } from "@/src/core/types";
import { PlanLinePriceField } from "./PlanLinePriceField";

// One row in the inline Plans editor. `id` present = an existing line being
// kept/edited; absent = a new line to create. `status` "cancelled" = a
// soft-cancelled line, shown read-only with a Reactivate action.
export type PlanRow = {
  key: string;
  id?: string;
  planId: string | null;
  startDate: string;
  customPrice: number | null;
  customCurrencyId: string | null;
  status: "active" | "cancelled";
};

interface Props {
  row: PlanRow;
  index: number;
  plan: Plan | null;
  branchId: string | null;
  currencies: Currency[];
  dateLocked: boolean;
  showHeader: boolean;
  canRemove: boolean;
  onPlanChange: (planId: string | null) => void;
  onStartDateChange: (date: string) => void;
  onPriceChange: (amount: number | null, currencyId: string | null) => void;
  onRemove: () => void;
  onReactivate: () => void;
  onAddPlan: () => void;
}

/** One service line as a card: plan, start date and price, stacked. */
export function PlanLineCard({
  row,
  index,
  plan,
  branchId,
  currencies,
  dateLocked,
  showHeader,
  canRemove,
  onPlanChange,
  onStartDateChange,
  onPriceChange,
  onRemove,
  onReactivate,
  onAddPlan,
}: Props) {
  const { t } = useTranslation();
  const cancelled = row.status === "cancelled";

  return (
    <View
      className={`rounded-2xl border px-3 pt-3 pb-3 mb-2 ${
        cancelled
          ? "border-gray-200 bg-gray-100 opacity-70"
          : "border-gray-200 bg-gray-50"
      }`}
    >
      {showHeader ? (
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center flex-1">
            <Text fontWeight="SemiBold" className="text-xs text-gray-500">
              {t("subscriptions.line_label", { number: index + 1 })}
            </Text>
            {cancelled ? (
              <View className="ms-2 rounded-full bg-gray-200 px-2 py-0.5">
                <Text fontWeight="SemiBold" className="text-[10px] text-gray-500">
                  {t("subscriptions.cancelled_badge")}
                </Text>
              </View>
            ) : null}
          </View>
          {cancelled ? (
            <PressableOpacity
              onPress={onReactivate}
              accessibilityLabel={t("subscriptions.reactivate_plan")}
              hitSlop={8}
              className="flex-row items-center px-2 py-1 -me-1"
            >
              <Ionicons name="refresh" size={15} color={COLORS.primary} />
              <Text className="ms-1 text-xs text-primary font-medium">
                {t("subscriptions.reactivate_plan")}
              </Text>
            </PressableOpacity>
          ) : canRemove ? (
            <PressableOpacity
              onPress={onRemove}
              accessibilityLabel={t("subscriptions.remove_plan")}
              hitSlop={8}
              className="p-1 -me-1"
            >
              <Ionicons name="trash-outline" size={17} color={COLORS.danger} />
            </PressableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* Plan + start date share a row — two short fields, one line each would
          double the card's height and there is one card per service line.
          Cancelled rows are read-only until reactivated. */}
      <View className="flex-row items-start gap-2 -mb-1">
        <View className="flex-1">
          <PlanPicker
            branchId={branchId}
            value={row.planId}
            onChange={onPlanChange}
            label={t("customers.plan_label")}
            onAddNew={onAddPlan}
            disabled={cancelled || branchId === null}
            disabledHint={t("subscriptions.select_branch_first")}
          />
        </View>
        <View className="w-36">
          <DatePickerInput
            label={t("subscriptions.start_label")}
            value={row.startDate}
            onChange={onStartDateChange}
            placeholder={t("customers.start_date_placeholder")}
            disabled={cancelled || dateLocked}
            disabledReason={
              dateLocked && !cancelled
                ? t("subscriptions.start_date_locked")
                : undefined
            }
          />
        </View>
      </View>

      <PlanLinePriceField
        plan={plan}
        customPrice={row.customPrice}
        customCurrencyId={row.customCurrencyId}
        onPriceChange={onPriceChange}
        currencies={currencies}
        disabled={cancelled}
      />
    </View>
  );
}
