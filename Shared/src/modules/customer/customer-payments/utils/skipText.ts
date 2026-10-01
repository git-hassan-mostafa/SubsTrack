import type { MonthEntry } from "@shared/core/types";

type TFn = (key: string, opts?: Record<string, unknown>) => string;

export type SkipMode = "skip" | "unskip";

export interface SkipText {
  title: string;
  message: string;
  confirmLabel: string;
  existingNote: string | null;
}

// An unskip only confirms, so it shows the note the skip was written with.
export function skipText(
  entries: MonthEntry[],
  mode: SkipMode,
  t: TFn,
): SkipText {
  const single = entries.length === 1 ? entries[0] : null;
  const monthYear = single ? `${t(`months.${single.label}`)} ${single.year}` : "";
  const count = entries.length;
  if (mode === "skip") {
    return {
      title: t("payments.skip.skip_title"),
      message: single
        ? t("payments.skip.skip_message", { monthYear })
        : t("payments.skip.skip_message_many", { count }),
      confirmLabel: t("payments.skip.skip_action"),
      existingNote: null,
    };
  }
  return {
    title: t("payments.skip.unskip_title"),
    message: single
      ? t("payments.skip.unskip_message", { monthYear })
      : t("payments.skip.unskip_message_many", { count }),
    confirmLabel: t("payments.skip.unskip_action"),
    existingNote: single?.skip?.note ?? null,
  };
}
