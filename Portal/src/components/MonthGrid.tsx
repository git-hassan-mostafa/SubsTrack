import { useTranslation } from "react-i18next";
import type { MonthEntry, MonthStatus } from "@/src/core/types";

// The same colours MonthCell uses in the staff app, so a customer checking their
// months against what staff read out sees the identical picture.
const REGULAR_BG: Record<MonthStatus, string> = {
  paid: "bg-green-600",
  unpaid: "bg-red-600",
  future: "bg-gray-100",
  before_start: "bg-gray-100",
  skipped: "bg-gray-500",
};

const NON_REGULAR_BG: Record<MonthStatus, string> = {
  paid: "bg-yellow-500",
  unpaid: "bg-gray-200",
  future: "bg-gray-100",
  before_start: "bg-gray-100",
  skipped: "bg-gray-500",
};

const REGULAR_TEXT: Record<MonthStatus, string> = {
  paid: "text-white",
  unpaid: "text-white",
  future: "text-gray-500",
  before_start: "text-gray-400",
  skipped: "text-white",
};

const NON_REGULAR_TEXT: Record<MonthStatus, string> = {
  paid: "text-white",
  unpaid: "text-gray-600",
  future: "text-gray-500",
  before_start: "text-gray-400",
  skipped: "text-white",
};

interface Props {
  entries: MonthEntry[];
  isRegular: boolean;
  onOpenReceipt: (chargeId: string) => void;
}

export function MonthGrid({ entries, isRegular, onOpenReceipt }: Props) {
  const { t } = useTranslation();
  const bg = isRegular ? REGULAR_BG : NON_REGULAR_BG;
  const text = isRegular ? REGULAR_TEXT : NON_REGULAR_TEXT;

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {entries.map((entry) => {
        // A partial payment resolves to "paid" - there is no "partial" status.
        // Only the presentation differs: an amber ring, and on a multi-month
        // block only the first cell carries it.
        const partial = entry.status === "paid" && entry.balance > 0;
        const ring =
          partial && !entry.isGroupSecondary
            ? "ring-4 ring-inset ring-amber-400"
            : "";

        // Only a month money has reached has a receipt to show. A secondary
        // cell of a multi-month block carries the SAME charge, so it opens the
        // block's one receipt.
        const chargeId =
          entry.status === "paid" && entry.charge ? entry.charge.id : null;
        const className = `${bg[entry.status]} ${ring} rounded-xl px-1 py-3 text-center`;

        const body = (
          <>
            <div className={`text-base font-bold ${text[entry.status]}`}>
              {entry.label}
            </div>
            <div
              className={`mt-1 text-xs font-medium leading-tight ${text[entry.status]}`}
            >
              {sublabel(entry, partial, t)}
            </div>
          </>
        );

        if (!chargeId) {
          return (
            <div key={entry.billingMonth} className={className}>
              {body}
            </div>
          );
        }

        return (
          <button
            key={entry.billingMonth}
            type="button"
            onClick={() => onOpenReceipt(chargeId)}
            aria-label={`${entry.label} — ${t("portal.receipt")}`}
            className={`${className} cursor-pointer underline-offset-2 hover:underline`}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

// Every cell says what it IS, so the grid can be read with no colour at all -
// on a black-and-white print, or by a colour-blind customer.
function sublabel(
  entry: MonthEntry,
  partial: boolean,
  t: (key: string) => string,
): string {
  if (entry.status === "before_start") return "";
  if (entry.status === "paid" && entry.isGroupSecondary)
    return t("portal.included");
  if (partial) return t("portal.partial");
  if (entry.status === "paid") return `✓ ${t("portal.paid")}`;
  if (entry.status === "skipped") return t("portal.paused");
  if (entry.status === "unpaid") return t("portal.not_paid");
  return t("portal.not_due_yet");
}
