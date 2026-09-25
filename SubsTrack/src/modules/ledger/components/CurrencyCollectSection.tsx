import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import { CARD_SURFACE } from "@/src/shared/constants";
import type { Currency, OpenItem } from "@/src/core/types";
import { formatMoney } from "@/src/core/utils/currency";
import type { CurrencyPlan } from "../utils/currencyGroups";
import { AllocationPreview } from "./AllocationPreview";
import { CollectAllButton } from "./CollectAllButton";

interface Props {
  plan: CurrencyPlan;
  currencies: Currency[];
  display: Currency | null;
  excluded: ReadonlySet<string>;
  grouped: boolean;
  onChangeAmount: (amount: number | null) => void;
  onToggle?: (item: OpenItem) => void;
}

/**
 * One currency's slice of the collect sheet: what is owed in it, the cash
 * actually received in it, and where that cash lands.
 *
 * The amount is typed in the currency's OWN units — never converted — because
 * this section is what becomes one `collections` row, and that row must say
 * what the customer physically handed over.
 *
 * `grouped` is the ONE-currency case turned off: a lone section is the sheet
 * itself, so it drops the card and the owed header the hero already carries.
 */
export function CurrencyCollectSection({
  plan,
  currencies,
  display,
  excluded,
  grouped,
  onChangeAmount,
  onToggle,
}: Props) {
  const { t } = useTranslation();
  const money = (value: number) =>
    formatMoney(value, plan.currency, plan.currency);
  const collecting = plan.lines.reduce((sum, l) => sum + l.amount, 0);
  const sameAsDisplay = (plan.currencyId ?? null) === (display?.id ?? null);
  const code = plan.currency?.code ?? "USD";
  const approx = sameAsDisplay
    ? null
    : `≈ ${formatMoney(plan.owed, plan.currency, display)}`;

  return (
    <View className={grouped ? `${CARD_SURFACE} mb-4 px-4 pb-4 pt-4` : "mb-4"}>
      {grouped && (
        <View className="mb-3 flex-row items-center justify-between gap-2">
          <Text fontWeight="SemiBold" className="text-base text-gray-900">
            {code}
          </Text>
          <Text className="text-xs text-gray-500" numberOfLines={1}>
            {t("ledger.amount_owed", { amount: money(plan.owed) })}
            {approx ? ` · ${approx}` : ""}
          </Text>
        </View>
      )}

      <CurrencyInput
        label={
          grouped
            ? t("ledger.amount_received_in", { currency: code })
            : t("ledger.amount")
        }
        labelAction={
          <CollectAllButton onPress={() => onChangeAmount(plan.owed)} />
        }
        amount={plan.amount}
        currencyId={plan.currencyId}
        currencies={currencies}
        lockCurrency
        onChange={(next) => onChangeAmount(next.amount)}
      />

      <AllocationPreview
        items={plan.items}
        lines={plan.lines}
        excluded={excluded}
        onToggle={onToggle}
        money={money}
        remainingAfter={plan.owed - collecting}
      />

      {plan.leftover > 0 && (
        <Text className="mt-3 text-xs text-amber-700">
          {plan.skippedCount > 0
            ? t("ledger.over_by_skipped", {
                count: plan.skippedCount,
                max: money(plan.payable),
              })
            : t("ledger.over_by", { max: money(plan.payable) })}
        </Text>
      )}
    </View>
  );
}
