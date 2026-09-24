import { useTranslation } from "react-i18next";
import { groupByCurrency } from "@/src/core/utils/currency";
import { keyOf } from "@/src/modules/ledger/utils/waterfall";
import type { PortalModel } from "../services/PortalReadModel";
import { Money } from "./Money";

// The whole answer in one block: how much, what it is for, and which bill the
// next hand-over settles. Totals are grouped PER CURRENCY and never summed
// across them (gotcha #108).
export function StatusCard({ model }: { model: PortalModel }) {
  const { t } = useTranslation();
  const groups = groupByCurrency(
    model.owed.map((item) => ({
      amount: item.balance,
      currencyId: item.currencyId,
      ratePerUsdSnapshot: item.ratePerUsdSnapshot,
    })),
  );

  if (groups.length === 0) {
    return (
      <section className="rounded-2xl border-2 border-green-600 bg-successLight p-5 text-center">
        <p className="text-2xl font-bold text-green-700">
          {t("portal.paid_up")}
        </p>
        <p className="mt-1 text-sm text-green-800">
          {t("portal.paid_up_hint")}
        </p>
      </section>
    );
  }

  const overdue = model.status.overdue;
  const frame = overdue
    ? "border-2 border-red-500 bg-red-50"
    : "border-2 border-gray-300 bg-white";

  return (
    <section className={`rounded-2xl ${frame} p-5`}>
      <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">
        {t("portal.you_owe")}
      </p>

      <div className="mt-1 space-y-1">
        {groups.map((group) => (
          <Money
            key={group.currencyId ?? "usd"}
            amount={group.amount}
            currencyId={group.currencyId}
            currencies={model.currencies}
            displayCurrencyId={model.displayCurrencyId}
            className="block text-4xl font-bold text-gray-900"
          />
        ))}
      </div>

      {overdue ? (
        <p className="mt-2 inline-block rounded-lg bg-red-600 px-2.5 py-1 text-sm font-bold text-white">
          {t("portal.overdue")}
        </p>
      ) : null}

      <div className="mt-4 border-t border-gray-300 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
          {t("portal.what_you_owe")}
        </p>
        <ul className="mt-2 space-y-1.5">
          {model.owed.map((item) => (
            <li
              key={keyOf(item)}
              className="flex items-baseline justify-between gap-3"
            >
              <span className="min-w-0 truncate text-base text-gray-800">
                {item.label}
              </span>
              <Money
                amount={item.balance}
                currencyId={item.currencyId}
                currencies={model.currencies}
                displayCurrencyId={model.displayCurrencyId}
                className="shrink-0 text-base font-semibold text-gray-900"
              />
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-sm text-gray-600">
          {t("portal.oldest_first")}
        </p>
      </div>
    </section>
  );
}
