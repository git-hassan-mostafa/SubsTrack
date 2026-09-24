import { findCurrency, formatMoneyPair } from "@/src/core/utils/currency";
import type { Currency } from "@/src/core/types";

interface Props {
  amount: number;
  currencyId: string | null;
  currencies: Currency[];
  displayCurrencyId: string | null;
  className?: string;
  inline?: boolean;
}

// Money always prints in the currency it was PHYSICALLY handed over in, with an
// approximate display-currency line only when the two differ (gotchas #108/#128).
// Converting across currencies is the trap this component exists to avoid.
export function Money({
  amount,
  currencyId,
  currencies,
  displayCurrencyId,
  className,
  inline,
}: Props) {
  const source = findCurrency(currencies, currencyId);
  const display = findCurrency(currencies, displayCurrencyId);
  const { primary, approx } = formatMoneyPair(amount, source, display);
  return (
    <span className={className}>
      <span dir="ltr" className="inline-block">
        {primary}
      </span>
      {approx ? (
        <span
          dir="ltr"
          className={
            inline ? "inline-block ps-1" : "block text-xs text-gray-500"
          }
        >
          {approx}
        </span>
      ) : null}
    </span>
  );
}
