import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CustomerPlan } from "@shared/core/types";
import { nowIso } from "@shared/core/utils/ids";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import {
  EMPTY_METER_CHANGE,
  isReadingDraftChanged,
  readingDraftOf,
  readingInputOf,
  readingPreview,
  type MeterChangeDraft,
} from "@shared/modules/customer/customer-payments/utils/meterReadingForm";
import { readingText } from "@shared/modules/customer/customer-payments/utils/meterReadingText";
import {
  isReadingLocked,
  lineUsageOf,
} from "@shared/modules/customer/customer-payments/utils/usageBill";
import { confirm } from "@shared/shared/lib/confirm";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { usePaymentSlice } from "@shared/state/hooks/usePaymentSlice";

const NO_MONTHS: string[] = [];

// One month's reading on one usage line; the preview runs the grid's own rules.
export function useMeterReading(line: CustomerPlan, billingMonth: string) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const readings = usePaymentSlice((s) => s.readings);
  const prices = usePaymentSlice((s) => s.prices);
  const paidMonths = usePaymentSlice((s) => s.paidMonthsByLine[line.id]) ?? NO_MONTHS;
  const saveReading = usePaymentSlice((s) => s.saveReading);
  const removeReading = usePaymentSlice((s) => s.removeReading);
  const saving = usePaymentSlice((s) => s.loadingReading);
  const error = usePaymentSlice((s) => s.error);
  const clearError = usePaymentSlice((s) => s.clearError);
  const currencies = useCurrencySlice((s) => s.items);

  const plan = line.plan?.usage ?? null;
  const entry = plan?.entry ?? "direct";
  const lineReadings = readings.filter((r) => r.customerPlanId === line.id);
  const saved = lineReadings.find((r) => r.billingMonth === billingMonth) ?? null;
  const [draft, setDraft] = useState(() => readingDraftOf(saved, entry));
  const [openedAt] = useState(nowIso);

  const usage = lineUsageOf(line, lineReadings, prices);
  const preview =
    usage && plan
      ? readingPreview(
          usage,
          billingMonth,
          draft,
          saved?.recordedAt ?? openedAt,
          plan.highUsagePercent,
        )
      : null;
  const isStartMonth = billingMonth.slice(0, 7) === line.startDate.slice(0, 7);
  const text =
    preview && plan
      ? readingText(preview, plan, billingMonth, isStartMonth, currencies, t)
      : null;
  const locked = isReadingLocked(entry, billingMonth, paidMonths);
  const input = readingInputOf(draft, entry);
  const changed = isReadingDraftChanged(draft, saved, entry);

  function edit(next: Partial<typeof draft>) {
    setDraft((prev) => ({ ...prev, ...next }));
    if (error) clearError();
  }

  function editMeterChange(patch: Partial<MeterChangeDraft>) {
    setDraft((prev) => ({
      ...prev,
      meterChange: { ...(prev.meterChange ?? EMPTY_METER_CHANGE), ...patch },
    }));
    if (error) clearError();
  }

  async function save(): Promise<boolean> {
    if (!input || locked || !user) return false;
    return saveReading({
      line,
      billingMonth,
      value: input.value,
      meterChange: input.meterChange,
      recordedByUserId: user.id,
    });
  }

  async function remove(): Promise<boolean> {
    if (!saved || locked || !user) return false;
    let removed = false;
    await confirm({
      title: t("payments.reading.remove_title"),
      message: t("payments.reading.remove_message"),
      confirmLabel: t("payments.reading.remove"),
      destructive: true,
      onConfirm: async () => {
        removed = await removeReading(saved, user.id);
      },
    });
    return removed;
  }

  return {
    plan,
    entry,
    meterNumber: line.meterNumber,
    saved,
    draft,
    setValue: (value: number | null) => edit({ value }),
    setMeterReplaced: (replaced: boolean) =>
      edit({ meterChange: replaced ? EMPTY_METER_CHANGE : null }),
    editMeterChange,
    text,
    locked,
    saving,
    error,
    clearError,
    canSave: !!input && changed && !locked && !saving,
    dirty: changed,
    save,
    remove,
  };
}

export type MeterReadingForm = ReturnType<typeof useMeterReading>;
