import { useTranslation } from "react-i18next";
import { formatDate } from "@/src/core/utils/date";
import { receiptId } from "@/src/core/utils/receiptId";
import type { PortalModel } from "../services/PortalReadModel";
import type { ReceiptTarget } from "./Receipt";
import { Money } from "./Money";

interface Props {
  model: PortalModel;
  onOpenReceipt: (target: ReceiptTarget) => void;
}

// Every hand-over the customer made. Showing who received it is the point: a
// customer can check the collector actually recorded the cash. Who HOLDS it now
// is staff-internal and never leaves the server.
export function PaymentList({ model, onOpenReceipt }: Props) {
  const { t } = useTranslation();

  return (
    <section className="rounded-2xl border border-gray-300 bg-white p-4">
      <h2 className="text-lg font-bold text-gray-900">
        {t("portal.payments")}
      </h2>

      {model.collections.length === 0 ? (
        <p className="mt-2 text-base text-gray-500">
          {t("portal.no_payments")}
        </p>
      ) : (
        <>
          <p className="mt-0.5 text-sm text-gray-600">
            {t("portal.tap_for_receipt")}
          </p>
          <ul className="mt-3 divide-y divide-gray-200">
            {model.collections.map((collection) => {
              const collector = collection.receivedByUserId
                ? model.collectorNames.get(collection.receivedByUserId)
                : null;
              return (
                <li key={collection.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenReceipt({ kind: "collection", id: collection.id })
                    }
                    className="flex w-full items-center justify-between gap-3 py-3 text-start"
                  >
                    <span className="min-w-0">
                      <span className="block text-base font-semibold text-gray-900">
                        {formatDate(collection.receivedAt)}
                      </span>
                      <span className="block truncate text-sm text-gray-600">
                        #{receiptId(collection.id)}
                        {collector
                          ? ` · ${t("portal.received_by")} ${collector}`
                          : ""}
                      </span>
                    </span>
                    <Money
                      amount={collection.amount}
                      currencyId={collection.currencyId}
                      currencies={model.currencies}
                      displayCurrencyId={model.displayCurrencyId}
                      className="shrink-0 text-base font-bold text-green-700"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
