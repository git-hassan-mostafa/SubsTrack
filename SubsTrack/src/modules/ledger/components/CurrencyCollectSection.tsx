import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import { CARD_SURFACE } from "@/src/shared/constants";
import type { Currency, OpenItem } from "@shared/core/types";
import { formatMoney, formatMoneyPair } from "@shared/core/utils/currency";
import {
  stillOwedAfter,
  type CurrencyPlan,
} from "@shared/modules/ledger/utils/currencyGroups";
import { overByText } from "@shared/modules/ledger/utils/allocationRows";
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

// Typed in the currency's OWN units: each section becomes one hand-over (#108b).
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
  const code = plan.currency?.code ?? "USD";
  const { approx } = formatMoneyPair(plan.owed, plan.currency, display);
  const overBy = overByText(plan, money, t);

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
        remainingAfter={stillOwedAfter(plan)}
      />

      {overBy ? (
        <Text className="mt-3 text-xs text-amber-700">{overBy}</Text>
      ) : null}
    </View>
  );
}
