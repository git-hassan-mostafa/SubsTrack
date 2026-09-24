import { useTranslation } from "react-i18next";
import { receiptId } from "@/src/core/utils/receiptId";
import { formatDate, formatDateTime } from "@/src/core/utils/date";
import type { PortalModel } from "../services/PortalReadModel";
import { buildMonthReceipt } from "../services/monthReceipt";
import { Money } from "./Money";

export type ReceiptTarget =
  | { kind: "collection"; id: string }
  | { kind: "sale"; id: string }
  | { kind: "month"; id: string };

interface Props {
  model: PortalModel;
  target: ReceiptTarget;
  onBack: () => void;
}

// Printing is window.print() over a @media print rule - no PDF library, and the
// browser already knows how to save the result as a PDF.
export function Receipt({ model, target, onBack }: Props) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-6">
      <div className="mx-auto max-w-md">
        <div className="no-print mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-base text-gray-700"
          >
            {t("portal.back")}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-primary px-4 py-2 text-base font-bold text-white"
          >
            {t("portal.print")}
          </button>
        </div>

        <div className="rounded-2xl border border-gray-300 bg-white p-5">
          <p className="text-center text-lg font-bold text-gray-900">
            {model.orgName}
          </p>
          <p className="mt-0.5 text-center text-sm text-gray-600">
            {t("portal.receipt")} · {model.customer.name}
          </p>

          <div className="mt-4 border-t border-gray-200 pt-4">
            {target.kind === "collection" ? renderCollection() : null}
            {target.kind === "sale" ? renderSale() : null}
            {target.kind === "month" ? renderMonth() : null}
          </div>

          <p className="mt-6 text-center text-sm text-gray-500">
            {t("portal.print_footer")}
          </p>
        </div>
      </div>
    </div>
  );

  function renderCollection() {
    const collection = model.collections.find((c) => c.id === target.id);
    if (!collection) return null;
    const collector = collection.receivedByUserId
      ? model.collectorNames.get(collection.receivedByUserId)
      : null;

    return (
      <>
        <Row label={t("portal.receipt_id")} value={`#${receiptId(collection.id)}`} />
        <Row label={t("portal.date")} value={formatDateTime(collection.receivedAt)} />
        {collector ? (
          <Row label={t("portal.received_by")} value={collector} />
        ) : null}

        <div className="mt-3 flex items-baseline justify-between border-t border-gray-200 pt-3">
          <span className="text-base font-bold text-gray-900">
            {t("portal.total")}
          </span>
          <Money
            amount={collection.amount}
            currencyId={collection.currencyId}
            currencies={model.currencies}
            displayCurrencyId={model.displayCurrencyId}
            className="text-xl font-bold text-gray-900"
          />
        </div>

        {/* One hand-over can settle several bills - the split is what makes the
            figure add up for the customer. */}
        {collection.items && collection.items.length > 0 ? (
          <div className="mt-4">
            <p className="text-sm font-semibold text-gray-700">
              {t("portal.this_pays")}
            </p>
            <ul className="mt-1.5 space-y-1">
              {collection.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-baseline justify-between gap-3 text-base text-gray-800"
                >
                  <span className="min-w-0 truncate">
                    {labelOfCharge(item.chargeId)}
                  </span>
                  <Money
                    amount={item.amount}
                    currencyId={collection.currencyId}
                    currencies={model.currencies}
                    displayCurrencyId={model.displayCurrencyId}
                    className="shrink-0"
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </>
    );
  }

  function renderSale() {
    const sale = model.sales.find((s) => s.id === target.id);
    if (!sale) return null;

    return (
      <>
        <Row label={t("portal.receipt_id")} value={`#${receiptId(sale.id)}`} />
        <Row label={t("portal.date")} value={formatDate(sale.soldAt)} />

        <ul className="mt-3 space-y-1 border-t border-gray-200 pt-3">
          {sale.items.map((item) => (
            <li
              key={item.id}
              className="flex items-baseline justify-between gap-3 text-base text-gray-800"
            >
              <span className="min-w-0 truncate">
                {item.itemNameSnapshot}
                {item.quantity > 1 ? ` × ${item.quantity}` : ""}
              </span>
              <Money
                amount={item.lineTotal}
                currencyId={sale.currencyId}
                currencies={model.currencies}
                displayCurrencyId={model.displayCurrencyId}
                className="shrink-0"
              />
            </li>
          ))}
        </ul>

        {/* The header total is TYPED, and the lines only suggest it - a receipt
            may legitimately not add up, because that gap is the discount. */}
        <div className="mt-3 flex items-baseline justify-between border-t border-gray-200 pt-3">
          <span className="text-base font-bold text-gray-900">
            {t("portal.total")}
          </span>
          <Money
            amount={sale.totalAmount}
            currencyId={sale.currencyId}
            currencies={model.currencies}
            displayCurrencyId={model.displayCurrencyId}
            className="text-xl font-bold text-gray-900"
          />
        </div>
      </>
    );
  }

  // One month bill, and every hand-over that has reached it. A month can be
  // settled by more than one payment, so the receipt is the BILL's, not a
  // single hand-over's.
  function renderMonth() {
    const found = model.chargesById.get(target.id);
    if (!found) return null;
    const { charge, payments, paid, remaining } = buildMonthReceipt(
      found,
      model.collections,
    );

    return (
      <>
        <Row
          label={t("portal.receipt_id")}
          value={`#${receiptId(charge.id)}`}
        />
        <Row label={t("portal.month")} value={labelOfCharge(charge.id)} />

        <div className="mt-3 flex items-baseline justify-between border-t border-gray-200 pt-3">
          <span className="text-base font-bold text-gray-900">
            {t("portal.total")}
          </span>
          <Money
            amount={charge.amount}
            currencyId={charge.currencyId}
            currencies={model.currencies}
            displayCurrencyId={model.displayCurrencyId}
            className="text-xl font-bold text-gray-900"
          />
        </div>

        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-base text-gray-700">{t("portal.paid")}</span>
          <Money
            amount={paid}
            currencyId={charge.currencyId}
            currencies={model.currencies}
            displayCurrencyId={model.displayCurrencyId}
            className="text-base font-semibold text-green-700"
          />
        </div>

        {remaining > 0 ? (
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-base text-gray-700">
              {t("portal.remaining")}
            </span>
            <Money
              amount={remaining}
              currencyId={charge.currencyId}
              currencies={model.currencies}
              displayCurrencyId={model.displayCurrencyId}
              className="text-base font-bold text-red-700"
            />
          </div>
        ) : null}

        {payments.length > 0 ? (
          <div className="mt-4">
            <p className="text-sm font-semibold text-gray-700">
              {t("portal.payments")}
            </p>
            <ul className="mt-1.5 space-y-2">
              {payments.map(({ collection, amount }) => (
                <li
                  key={collection.id}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-gray-700">
                      {formatDate(collection.receivedAt)} · #
                      {receiptId(collection.id)}
                    </span>
                    {collection.receivedByUserId &&
                    model.collectorNames.get(collection.receivedByUserId) ? (
                      <span className="block truncate text-xs text-gray-400">
                        {t("portal.received_by")}{" "}
                        {model.collectorNames.get(collection.receivedByUserId)}
                      </span>
                    ) : null}
                  </span>
                  <Money
                    amount={amount}
                    currencyId={collection.currencyId}
                    currencies={model.currencies}
                    displayCurrencyId={model.displayCurrencyId}
                    className="shrink-0 text-gray-900"
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </>
    );
  }

  // chargeLabel is the app's own naming - "Jan 2026 · Internet" for a month,
  // "#A1B2C3 · Router" for a sale - so a bill never reads differently here.
  function labelOfCharge(chargeId: string): string {
    return model.chargeLabels.get(chargeId) ?? "";
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-base">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}
