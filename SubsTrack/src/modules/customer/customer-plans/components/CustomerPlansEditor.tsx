import { useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import type { LineDrafts } from "@shared/modules/customer/customer-plans/hooks/useLineDrafts";
import { PlanLineCard } from "./PlanLineCard";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";
import { PlanFormSheet } from "@/src/modules/admin/plans";

interface Props {
  drafts: LineDrafts;
  branchId: string | null;
}

// The rows and their rules live in Shared useLineDrafts; this only draws them.
export function CustomerPlansEditor({ drafts, branchId }: Props) {
  const { t } = useTranslation();
  const plans = usePlanSlice((s) => s.items);
  const currencies = useCurrencySlice((s) => s.items);
  const [addPlanOpen, setAddPlanOpen] = useState(false);
  const multiple = drafts.rows.length > 1;

  return (
    <View className="mt-2 mb-2 border-t border-gray-100 pt-3">
      <View className="flex-row items-center mb-2">
        <Ionicons name="layers-outline" size={16} color={COLORS.gray500} />
        <Text
          fontWeight="SemiBold"
          className="ms-2 flex-1 text-sm text-gray-900"
        >
          {t("subscriptions.section_title")}
        </Text>
        {multiple ? (
          <Text className="text-xs text-gray-400">
            {t("subscriptions.section_subtitle")}
          </Text>
        ) : null}
      </View>

      {drafts.rows.map((row, i) => (
        <PlanLineCard
          key={row.key}
          row={row}
          index={i}
          plan={plans.find((p) => p.id === row.planId) ?? null}
          branchId={branchId}
          currencies={currencies}
          dateLocked={drafts.isDateLocked(row)}
          showHeader={multiple}
          canRemove={drafts.activeCount > 1}
          removing={drafts.removingKey === row.key}
          priceChanged={drafts.priceChanged(row)}
          onPriceFromChange={(month) => drafts.setPriceFrom(row.key, month)}
          onPlanChange={(v) => drafts.setPlan(row.key, v)}
          onStartDateChange={(v) => drafts.setStartDate(row.key, v)}
          onPriceChange={(amount, currencyId) =>
            drafts.setPrice(row.key, amount, currencyId)
          }
          onRemove={() => void drafts.removeRow(row.key)}
          onReactivate={() => drafts.reactivateRow(row.key)}
          onAddPlan={() => setAddPlanOpen(true)}
        />
      ))}

      <PressableOpacity
        onPress={drafts.addRow}
        className="flex-row items-center justify-center rounded-xl border border-dashed border-gray-300 py-2"
      >
        <Ionicons name="add" size={16} color={COLORS.primary} />
        <Text fontWeight="SemiBold" className="text-primary text-xs ms-1">
          {t("subscriptions.add_plan")}
        </Text>
      </PressableOpacity>

      {addPlanOpen && <PlanFormSheet onDismiss={() => setAddPlanOpen(false)} />}
    </View>
  );
}
