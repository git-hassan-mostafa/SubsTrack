import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Button } from "@/src/shared/components/Button";
import { Dropdown } from "@/src/shared/components/Dropdown";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import type { Plan } from "@shared/core/types";
import { useUsageMonthPrices } from "@shared/modules/admin/plans/hooks/useUsageMonthPrices";
import { priceStartOptionsWith } from "@shared/modules/customer/customer-plans/utils/priceStartOptions";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";
import { UsagePriceCard } from "./UsagePriceCard";

interface Props {
  plans: Plan[];
  onDismiss: () => void;
}

export function UsageMonthPricesSheet({ plans, onDismiss }: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const clearPlanError = usePlanSlice((s) => s.clearError);
  const prices = useUsageMonthPrices(plans);

  useEffect(() => {
    clearPlanError();
    return clearPlanError;
  }, [clearPlanError]);

  async function handleSave() {
    if (await prices.save()) onDismiss();
  }

  return (
    <FormSheet
      onDismiss={onDismiss}
      dirty={prices.dirty}
      title={t("plans.month_prices_title")}
    >
      {prices.error ? (
        <ErrorBanner message={prices.error} onDismiss={prices.clearError} />
      ) : null}

      <Dropdown<string>
        label={t("plans.month_prices_month")}
        options={priceStartOptionsWith(prices.month)}
        value={prices.month}
        onChange={(month) => {
          if (month) prices.setMonth(month);
        }}
      />
      <Text className="text-xs text-gray-400 -mt-3 mb-4">
        {t("plans.month_prices_hint")}
      </Text>

      {prices.loading ? (
        <View className="py-6 items-center">
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : prices.drafts.length === 0 ? (
        <Text className="text-sm text-gray-500 mb-4">
          {t("plans.month_prices_no_plans")}
        </Text>
      ) : (
        prices.drafts.map((draft) => (
          <UsagePriceCard
            key={`${draft.plan.id}-${prices.month}`}
            draft={draft}
            currencies={currencies}
            onChange={(patch) => prices.edit(draft.plan.id, patch)}
            onFocus={prices.clearError}
          />
        ))
      )}

      <Button
        label={t("common.save")}
        onPress={handleSave}
        loading={prices.saving}
        disabled={!prices.canSave}
        fullWidth
      />

      <View className="h-24" />
    </FormSheet>
  );
}
