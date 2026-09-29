import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import billingService from "@shared/modules/admin/billing/services/BillingService";
import {
  allowanceFloor,
  openingAllowanceTotal,
  readAllowanceDraft,
  withCustomerTotal,
} from "@shared/modules/admin/billing/utils/allowanceDraft";
import {
  askText,
  requestedPair,
} from "@shared/modules/admin/billing/utils/requestAsk";
import {
  MIN_CUSTOMER_ALLOWANCE,
  MIN_CUSTOMER_REQUEST,
  type QuotaKind,
  type QuotaPair,
} from "@shared/modules/admin/billing/utils/types";
import { useDirtyForm } from "@shared/shared/hooks/useDirtyForm";
import { confirm } from "@shared/shared/lib/confirm";
import { useBillingSlice } from "@shared/state/hooks/useBillingSlice";

const NO_CHANGE: QuotaPair = { customers: 0, plans: 0 };

// Both apps' "update your limits" form: a raise is a request, a cut is not.
export function useAllowanceForm(editing: boolean) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const request = useBillingSlice((s) => s.request);
  const limits = useBillingSlice((s) => s.limits);
  const active = useBillingSlice((s) => s.active);
  const price = useBillingSlice((s) => s.pricePerPlanUsd);
  const lowerAllowances = useBillingSlice((s) => s.lowerAllowances);
  const requestMore = useBillingSlice((s) => s.requestMore);
  const editRequest = useBillingSlice((s) => s.editRequest);
  const [total, setTotal] = useState<QuotaPair>(() =>
    openingAllowanceTotal(
      limits,
      request && editing ? requestedPair(request) : NO_CHANGE,
    ),
  );
  const dirty = useDirtyForm({ ...total });
  const draft = readAllowanceDraft({ total, limits, active, editing });

  const setCustomers = (next: number) =>
    setTotal((prev) => withCustomerTotal(prev, next));
  const setPlans = (next: number) =>
    setTotal((prev) => ({ ...prev, plans: next }));

  const floor = (kind: QuotaKind) =>
    allowanceFloor(kind, total, limits, editing);

  const fieldError = (kind: QuotaKind): string | null => {
    if (draft.overCap.includes(kind))
      return t(`billing.decrease_floor_error_${kind}`, {
        count: active[kind],
        requested: total[kind],
        excess: active[kind] - total[kind],
      });
    if (kind === "customers" && draft.belowMinimum)
      return t("billing.decrease_min_error", { min: MIN_CUSTOMER_ALLOWANCE });
    return null;
  };

  const formError = draft.mixed
    ? t("billing.mixed_change_error")
    : draft.tooSmallRaise
      ? t("billing.request_min_error", { min: MIN_CUSTOMER_REQUEST })
      : null;

  const lower = async (): Promise<boolean> => {
    let lowered = false;
    await confirm({
      title: t("billing.decrease_confirm_title"),
      message: t("billing.decrease_confirm_body", {
        customers: total.customers,
        plans: total.plans,
      }),
      confirmLabel: t("billing.decrease_save"),
      onConfirm: async () => {
        lowered = await lowerAllowances(total);
      },
    });
    return lowered;
  };

  const send = async (): Promise<QuotaPair | null> => {
    if (!user) return null;
    const ok = editing
      ? await editRequest(draft.extra)
      : await requestMore(user.tenantId, draft.extra, user.id);
    return ok ? draft.extra : null;
  };

  const requestMessage = (extra: QuotaPair): string =>
    t("billing.whatsapp_request_message", {
      org: user?.tenant.name ?? "",
      ask: askText(t, extra),
    });

  return {
    total,
    limits,
    active,
    draft,
    dirty,
    sendsRequest: editing || draft.raising,
    loweredAmountUsd: billingService.monthlyAmountUsd(total.plans, price),
    askText: askText(t, draft.extra),
    setCustomers,
    setPlans,
    floor,
    fieldError,
    formError,
    lower,
    send,
    requestMessage,
  };
}
