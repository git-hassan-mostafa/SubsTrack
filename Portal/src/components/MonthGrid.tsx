import { useTranslation } from "react-i18next";
import type { MonthEntry, MonthStatus } from "@shared/core/types";
import {
  isPartialMonth,
  isWrittenOffMonth,
  showsPartialRing,
} from "@shared/modules/customer/customer-payments/utils/monthGridLayout";

// Same colours as the staff app's MonthCell, so both show the same picture.
const REGULAR_BG: Record<MonthStatus, string> = {
  paid: "bg-green-600",
  unpaid: "bg-red-600",
  future: "bg-gray-100",
  before_start: "bg-gray-100",
  skipped: "bg-gray-500",
  written_off: "bg-gray-200",
  waiting: "bg-indigo-50",
  no_service: "bg-gray-200",
};

const NON_REGULAR_BG: Record<MonthStatus, string> = {
  paid: "bg-yellow-500",
  unpaid: "bg-gray-200",
  future: "bg-gray-100",
  before_start: "bg-gray-100",
  skipped: "bg-gray-500",
  written_off: "bg-gray-200",
  waiting: "bg-indigo-50",
  no_service: "bg-gray-200",
};

const REGULAR_TEXT: Record<MonthStatus, string> = {
  paid: "text-white",
  unpaid: "text-white",
  future: "text-gray-500",
  before_start: "text-gray-400",
  skipped: "text-white",
  written_off: "text-orange-700",
  waiting: "text-indigo-500",
  no_service: "text-gray-600",
};

const NON_REGULAR_TEXT: Record<MonthStatus, string> = {
  paid: "text-white",
  unpaid: "text-gray-600",
  future: "text-gray-500",
  before_start: "text-gray-400",
  skipped: "text-white",
  written_off: "text-orange-700",
  waiting: "text-indigo-500",
  no_service: "text-gray-600",
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
        const look = isWrittenOffMonth(entry) ? "written_off" : entry.status;
        const ring = showsPartialRing(entry)
          ? "ring-4 ring-inset ring-amber-400"
          : "";
        const chargeId =
          entry.status === "paid" && entry.charge ? entry.charge.id : null;
        const className = `${bg[look]} ${ring} rounded-xl px-1 py-3 text-center`;

        const body = (
          <>
            <div className={`text-base font-bold ${text[look]}`}>
              {entry.label}
            </div>
            <div
              className={`mt-1 text-xs font-medium leading-tight ${text[look]}`}
            >
              {sublabel(entry, t)}
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

// Every cell says what it IS, so the grid reads with no colour at all.
function sublabel(entry: MonthEntry, t: (key: string) => string): string {
  if (entry.status === "before_start") return "";
  if (isWrittenOffMonth(entry)) return t("portal.written_off");
  if (entry.status === "paid" && entry.isGroupSecondary)
    return t("portal.included");
  if (isPartialMonth(entry)) return t("portal.partial");
  if (entry.status === "paid") return `✓ ${t("portal.paid")}`;
  if (entry.status === "skipped") return t("portal.paused");
  if (entry.status === "unpaid") return t("portal.not_paid");
  if (entry.status === "no_service") return t("portal.no_service");
  return t("portal.not_due_yet");
}
