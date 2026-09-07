import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import type { Currency, OpenItem } from "@/src/core/types";
import { formatMoney } from "@/src/core/utils/currency";
import type { CurrencyPlan } from "../utils/currencyGroups";
import { AllocationPreview } from "./AllocationPreview";

interface Props {
  plan: CurrencyPlan;
  currencies: Currency[];
  display: Currency | null;
  excluded: ReadonlySet<string>;
  onChangeAmount: (amount: number | null) => void;
  onToggle: (item: OpenItem) => void;
}

/**
 * One currency's slice of the collect sheet: what is owed in it, the cash
 * actually received in it, and where that cash lands.
 *
 * The amount is typed in the currency's OWN units — never converted — because
 * this section is what becomes one `collections` row, and that row must say
 * what the customer physically handed over.
 */
export function CurrencyCollectSection({
  plan,
  currencies,
  display,
  excluded,
  onChangeAmount,
  onToggle,
}: Props) {
  const { t } = useTranslation();
  const money = (value: number) => formatMoney(value, plan.currency, plan.currency);
  const collecting = plan.lines.reduce((sum, l) => sum + l.amount, 0);
  const sameAsDisplay = (plan.currencyId ?? null) === (display?.id ?? null);
  const code = plan.currency?.code ?? "USD";

  return (
    <View className="gap-3 rounded-2xl border border-slate-200 p-3">
      <View className="flex-row items-center justify-between">
        <Text fontWeight="Bold" className="text-sm text-slate-900">
          {code}
        </Text>
        <View className="flex-row items-center gap-3">
          <Text className="text-xs text-slate-500">
            {t("ledger.amount_owed", { amount: money(plan.owed) })}
          </Text>
          <PressableOpacity
            onPress={() => onChangeAmount(plan.owed)}
            className="rounded-lg bg-slate-100 px-3 py-1.5"
          >
            <Text className="text-xs font-medium text-primary">
              {t("ledger.collect_all")}
            </Text>
          </PressableOpacity>
        </View>
      </View>

      <CurrencyInput
        label={t("ledger.amount_received_in", { currency: code })}
        amount={plan.amount}
        currencyId={plan.currencyId}
        currencies={currencies}
        lockCurrency
        onChange={(next) => onChangeAmount(next.amount)}
      />

      {collecting > 0 && !sameAsDisplay && (
        <Text className="text-xs text-slate-500">
          {`≈ ${formatMoney(collecting, plan.currency, display)}`}
        </Text>
      )}

      <AllocationPreview
        items={plan.items}
        lines={plan.lines}
        excluded={excluded}
        onToggle={onToggle}
        money={money}
        remainingAfter={plan.owed - collecting}
      />

      {plan.leftover > 0 && (
        <Text className="text-xs text-amber-700">
          {t("ledger.cannot_exceed", { amount: money(plan.owed) })}
        </Text>
      )}
    </View>
  );
}
