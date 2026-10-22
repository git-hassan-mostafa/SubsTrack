import { ActivityIndicator, Switch, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { PlanPicker } from "@/src/shared/components/PlanPicker";
import { PriceStartPicker } from "@/src/shared/components/PriceStartPicker";
import { COLORS } from "@/src/shared/constants";
import type { Currency, Plan } from "@shared/core/types";
import { usageBillingLabel } from "@shared/modules/admin/plans/utils/planLabels";
import { PlanLinePriceField } from "./PlanLinePriceField";
import { PlanLineMeterFields } from "./PlanLineMeterFields";
import type { LineRow } from "@shared/modules/customer/customer-plans/utils/lineDrafts";

interface Props {
  row: LineRow;
  index: number;
  plan: Plan | null;
  branchId: string | null;
  currencies: Currency[];
  locked: boolean;
  startReadingLocked: boolean;
  showHeader: boolean;
  canRemove: boolean;
  removing: boolean;
  priceChanged: boolean;
  onPriceFromChange: (month: string) => void;
  onPlanChange: (planId: string | null) => void;
  onStartDateChange: (date: string) => void;
  canBePrepaid: boolean;
  onPrepaidChange: (prepaid: boolean) => void;
  onPriceChange: (amount: number | null, currencyId: string | null) => void;
  onMeterNumberChange: (meterNumber: string) => void;
  onStartReadingChange: (startReading: number | null) => void;
  onRemove: () => void;
  onReactivate: () => void;
  onAddPlan: () => void;
}

// Cancelled rows stay read-only until reactivated.
export function PlanLineCard({
  row,
  index,
  plan,
  branchId,
  currencies,
  locked,
  startReadingLocked,
  showHeader,
  canRemove,
  removing,
  priceChanged,
  onPriceFromChange,
  onPlanChange,
  onStartDateChange,
  canBePrepaid,
  onPrepaidChange,
  onPriceChange,
  onMeterNumberChange,
  onStartReadingChange,
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
                <Text
                  fontWeight="SemiBold"
                  className="text-xs text-gray-500"
                >
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
              <Text fontWeight="Medium" className="ms-1 text-xs text-primary">
                {t("subscriptions.reactivate_plan")}
              </Text>
            </PressableOpacity>
          ) : canRemove ? (
            <PressableOpacity
              onPress={onRemove}
              disabled={removing}
              accessibilityLabel={t("subscriptions.remove_plan")}
              hitSlop={8}
              className="w-[25px] h-[25px] items-center justify-center -me-1"
            >
              {removing ? (
                <ActivityIndicator size="small" color={COLORS.danger} />
              ) : (
                <Ionicons
                  name="trash-outline"
                  size={17}
                  color={COLORS.danger}
                />
              )}
            </PressableOpacity>
          ) : null}
        </View>
      ) : null}

      <View className="flex-row items-start gap-2 -mb-1">
        <View className="flex-1">
          <PlanPicker
            branchId={branchId}
            value={row.planId}
            onChange={onPlanChange}
            label={t("customers.plan_label")}
            onAddNew={onAddPlan}
            disabled={cancelled || locked || branchId === null}
            disabledHint={
              branchId === null
                ? t("subscriptions.select_branch_first")
                : locked && !cancelled
                  ? t("subscriptions.plan_locked")
                  : undefined
            }
          />
        </View>
        <View className="w-36">
          <DatePickerInput
            label={t("subscriptions.start_label")}
            value={row.startDate}
            onChange={onStartDateChange}
            placeholder={t("customers.start_date_placeholder")}
            disabled={cancelled || locked}
            disabledReason={
              locked && !cancelled
                ? t("subscriptions.start_date_locked")
                : undefined
            }
          />
        </View>
      </View>

      {plan?.usage ? (
        <>
          <Text className="text-sm text-gray-500" numberOfLines={1}>
            {t("subscriptions.priced_by_usage", {
              billing: usageBillingLabel(plan.usage, t),
            })}
          </Text>
          {plan.usage.entry === "reading" ? (
            <PlanLineMeterFields
              meterNumber={row.meterNumber}
              startReading={row.startReading}
              startReadingLocked={startReadingLocked}
              disabled={cancelled}
              onMeterNumberChange={onMeterNumberChange}
              onStartReadingChange={onStartReadingChange}
            />
          ) : null}
        </>
      ) : (
        <>
          <PlanLinePriceField
            plan={plan}
            customPrice={row.customPrice}
            customCurrencyId={row.customCurrencyId}
            onPriceChange={onPriceChange}
            currencies={currencies}
            disabled={cancelled}
          />

          {priceChanged ? (
            <View className="mt-3 -mb-4">
              <PriceStartPicker value={row.priceFrom} onChange={onPriceFromChange} />
            </View>
          ) : null}
        </>
      )}

      {canBePrepaid ? (
        <View className="flex-row items-center justify-between mt-3">
          <View className="flex-1 me-3">
            <Text fontWeight="SemiBold" className="text-sm text-gray-900">
              {t("subscriptions.prepaid_label")}
            </Text>
            <Text className="text-xs text-gray-400 mt-0.5">
              {locked && !cancelled
                ? t("subscriptions.prepaid_locked")
                : t("subscriptions.prepaid_hint")}
            </Text>
          </View>
          <Switch
            value={row.prepaid}
            disabled={cancelled || locked}
            onValueChange={onPrepaidChange}
            trackColor={{ true: COLORS.primary }}
          />
        </View>
      ) : null}
    </View>
  );
}
