import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { Charge, OpenItem } from "@shared/core/types";
import { confirm } from "@shared/shared/lib/confirm";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";

export interface WriteOffTarget {
  chargeId: string | null;
  balance: number;
  currencyId: string | null;
  customerName: string;
}

export function writeOffTargetOf(
  charge: Pick<Charge, "id" | "currencyId">,
  balance: number,
  customerName: string,
): WriteOffTarget {
  return { chargeId: charge.id, balance, currencyId: charge.currencyId, customerName };
}

// The write-off doors; the work runs INSIDE the confirm (#144).
export function useWriteOffActions() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const writeOffCharge = useLedgerSlice((s) => s.writeOffCharge);
  const writeOffCharges = useLedgerSlice((s) => s.writeOffCharges);
  const revertWriteOff = useLedgerSlice((s) => s.revertWriteOff);

  const target = findCurrency(currencies, displayCurrencyId);

  const writeOff = useCallback(
    async (item: WriteOffTarget) => {
      if (!user || !item.chargeId) return;
      const source = findCurrency(currencies, item.currencyId);
      const chargeId = item.chargeId;
      await confirm({
        title: t("ledger.write_off_title"),
        message: t("ledger.write_off_message", {
          amount: formatMoney(item.balance, source, target),
          customer: item.customerName,
        }),
        confirmLabel: t("ledger.write_off"),
        destructive: true,
        onConfirm: async () => {
          await writeOffCharge(chargeId, user.id, null);
        },
      });
    },
    [user, currencies, target, t, writeOffCharge],
  );

  const revert = useCallback(
    async (item: WriteOffTarget) => {
      if (!item.chargeId) return;
      const source = findCurrency(currencies, item.currencyId);
      const chargeId = item.chargeId;
      await confirm({
        title: t("ledger.revert_write_off_title"),
        message: t("ledger.revert_write_off_message", {
          amount: formatMoney(item.balance, source, target),
          customer: item.customerName,
        }),
        confirmLabel: t("ledger.revert_write_off"),
        onConfirm: async () => {
          await revertWriteOff(chargeId);
        },
      });
    },
    [currencies, target, t, revertWriteOff],
  );

  const writeOffAll = useCallback(
    async (customerName: string, items: OpenItem[]): Promise<boolean> => {
      if (!user) return false;
      const billed = items.filter((i) => !!i.chargeId);
      const ids = [...new Set(billed.map((i) => i.chargeId as string))];
      if (ids.length === 0) return false;
      const totalUsd = billed.reduce(
        (sum, i) => sum + i.balance / i.ratePerUsdSnapshot,
        0,
      );
      let wrote = false;
      await confirm({
        title: t("ledger.write_off_all_title"),
        message: t("ledger.write_off_all_message", {
          amount: formatMoney(totalUsd, null, target),
          customer: customerName,
          count: ids.length,
        }),
        confirmLabel: t("ledger.write_off_all"),
        destructive: true,
        onConfirm: async () => {
          wrote = await writeOffCharges(ids, user.id, null);
        },
      });
      return wrote;
    },
    [user, target, t, writeOffCharges],
  );

  return { writeOff, revert, writeOffAll };
}
