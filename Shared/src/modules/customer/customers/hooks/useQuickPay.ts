import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Collection, Customer, OpenItem } from "@shared/core/types";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import {
  bulkQuickPayPlan,
  currentMonthItems,
  quickPayInputs,
  type QuickPayTarget,
} from "@shared/modules/customer/customers/utils/quickPay";
import { confirm } from "@shared/shared/lib/confirm";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";

export interface QuickPayOptions {
  onPaid: (collections: Collection[]) => void;
  onTypeOne: (customer: Customer, item: OpenItem) => void;
  onTypeMany: (customer: Customer) => void;
  sendReceipt: (customer: Customer, collection: Collection) => Promise<unknown>;
  onNotice: (message: string) => void;
}

export interface QuickPay {
  busyCustomerId: string | null;
  bulkBusy: boolean;
  quickPay: (target: QuickPayTarget, send?: boolean) => Promise<void>;
  bulkQuickPay: (targets: QuickPayTarget[]) => Promise<void>;
}

// This month of the priced lines in one tap; an unpriced line asks for its amount.
export function useQuickPay({
  onPaid,
  onTypeOne,
  onTypeMany,
  sendReceipt,
  onNotice,
}: QuickPayOptions): QuickPay {
  const { t } = useTranslation();
  const { user } = useAuth();
  const collect = useLedgerSlice((s) => s.collect);
  const currencies = useCurrencySlice((s) => s.items);
  const [busyCustomerId, setBusyCustomerId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const pay = async (items: OpenItem[]): Promise<Collection[]> => {
    if (!user || items.length === 0) return [];
    const author = { tenantId: user.tenantId, receivedByUserId: user.id };
    const created: Collection[] = [];
    let failed = 0;
    for (const input of quickPayInputs(items, author, new Date().toISOString())) {
      const row = await collect(input);
      if (row) created.push(row);
      else failed += 1;
    }
    onPaid(created);
    if (failed > 0) onNotice(t("customers.bulk_pay_summary", { ok: created.length, failed }));
    return created;
  };

  const payMessage = (count: number, warnings: string[]) =>
    t("customers.bulk_pay_lines_message", { count }) +
    (warnings.length > 0 ? "\n\n" + warnings.join("\n") : "");

  const quickPay = async ({ customer, status }: QuickPayTarget, send = false) => {
    const items = currentMonthItems(customer, status, currencies);
    if (items.length === 0) return;
    const requests = items.filter((i) => !i.openAmount);
    if (requests.length === 0) {
      if (items.length === 1) onTypeOne(customer, items[0]);
      else onTypeMany(customer);
      return;
    }
    const multiCount = requests.filter((r) => r.durationMonths > 1).length;

    const run = async () => {
      setBusyCustomerId(customer.id);
      await pay(requests)
        .then(async (created) => {
          if (!send) return;
          for (const collection of created) await sendReceipt(customer, collection);
        })
        .finally(() => setBusyCustomerId(null));
    };

    if (requests.length > 1 || multiCount > 0) {
      const warnings = multiCount > 0 ? [t("customers.bulk_pay_warn_multi", { count: multiCount })] : [];
      await confirm({
        title: t("payments.quick_pay.pay_now"),
        message: payMessage(requests.length, warnings),
        confirmLabel: t("payments.quick_pay.pay_now"),
        onConfirm: run,
      });
      return;
    }
    await run();
  };

  const bulkQuickPay = async (targets: QuickPayTarget[]) => {
    if (bulkBusy || targets.length === 0 || !user) return;
    const { requests, typedCount, multiCount } = bulkQuickPayPlan(targets, currencies);
    if (requests.length === 0) {
      await confirm({
        title: t("payments.quick_pay.pay_now"),
        message: t("customers.bulk_pay_none"),
        confirmLabel: t("common.ok"),
        hideCancel: true,
      });
      return;
    }
    const warnings: string[] = [];
    if (multiCount > 0) warnings.push(t("customers.bulk_pay_warn_multi", { count: multiCount }));
    if (typedCount > 0) warnings.push(t("customers.bulk_pay_skip_custom", { count: typedCount }));
    await confirm({
      title: t("payments.quick_pay.pay_now"),
      message: payMessage(requests.length, warnings),
      confirmLabel: t("payments.quick_pay.pay_now"),
      onConfirm: async () => {
        setBulkBusy(true);
        await pay(requests).finally(() => setBulkBusy(false));
      },
    });
  };

  return { busyCustomerId, bulkBusy, quickPay, bulkQuickPay };
}
