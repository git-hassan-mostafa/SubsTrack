import { useTranslation } from "react-i18next";
import { receiptId } from "@/src/core/utils/receiptId";
import { formatDate } from "@/src/core/utils/date";
import type { PortalModel } from "../services/PortalReadModel";
import type { ReceiptTarget } from "./Receipt";
import { Money } from "./Money";

interface Props {
  model: PortalModel;
  onOpenReceipt: (target: ReceiptTarget) => void;
}

// A sale is identified by its RECEIPT NUMBER, the same six characters the app
// and the WhatsApp receipt print, so a customer can quote it back.
export function SaleList({ model, onOpenReceipt }: Props) {
  const { t } = useTranslation();
  if (model.sales.length === 0) return null;

  return (
    <section className="rounded-2xl border border-gray-300 bg-white p-4">
      <h2 className="text-lg font-bold text-gray-900">
        {t("portal.purchases")}
      </h2>
      <p className="mt-0.5 text-sm text-gray-600">
        {t("portal.tap_for_receipt")}
      </p>

      <ul className="mt-3 divide-y divide-gray-200">
        {model.sales.map((sale) => (
          <li key={sale.id}>
            <button
              type="button"
              onClick={() => onOpenReceipt({ kind: "sale", id: sale.id })}
              className="flex w-full items-center justify-between gap-3 py-3 text-start"
            >
              <span className="min-w-0">
                <span className="block text-base font-semibold text-gray-900">
                  {formatDate(sale.soldAt)}
                </span>
                <span className="block truncate text-sm text-gray-600">
                  #{receiptId(sale.id)} · {sale.itemsSummary}
                </span>
              </span>
              <Money
                amount={sale.totalAmount}
                currencyId={sale.currencyId}
                currencies={model.currencies}
                displayCurrencyId={model.displayCurrencyId}
                className="shrink-0 text-base font-bold text-gray-900"
              />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
