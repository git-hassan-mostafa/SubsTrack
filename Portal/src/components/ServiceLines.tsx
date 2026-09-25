import { useTranslation } from "react-i18next";
import { resolveLinePrice } from "@/src/modules/customer/customer-plans/utils/linePrice";
import { lineLabel } from "@/src/modules/customer/customer-plans/utils/lineLabel";
import { formatDate } from "@/src/core/utils/date";
import type { PortalModel } from "../services/PortalReadModel";
import { Money } from "./Money";

// One row per active service line. The line owns the only start date - the
// customer record has none.
export function ServiceLines({ model }: { model: PortalModel }) {
  const { t } = useTranslation();
  const lines = model.lines.filter((line) => line.active);
  if (lines.length === 0) return null;

  return (
    <section className="rounded-2xl border border-gray-300 bg-white p-4">
      <h2 className="text-lg font-bold text-gray-900">
        {t("portal.your_services")}
      </h2>

      <ul className="mt-3 divide-y divide-gray-200">
        {lines.map((line) => {
          const price = resolveLinePrice(line);
          return (
            <li
              key={line.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <span className="min-w-0">
                <span className="block truncate text-base font-semibold text-gray-900">
                  {lineLabel(line, t("portal.no_plan"))}
                </span>
                <span className="block text-sm text-gray-600">
                  {t("portal.started")} {formatDate(line.startDate)}
                </span>
              </span>
              {price.isFixed && price.amount !== null ? (
                <Money
                  amount={price.amount}
                  currencyId={price.currencyId}
                  currencies={model.currencies}
                  displayCurrencyId={model.displayCurrencyId}
                  className="shrink-0 text-base font-semibold text-gray-900"
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
