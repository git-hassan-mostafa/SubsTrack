import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { Charge, OpenItem } from "@shared/core/types";
import { confirm } from "@shared/shared/lib/confirm";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { owedUsd } from "@shared/modules/ledger/utils/debtRule";
import {
  writeOffItems,
  type WriteOffReach,
} from "@shared/modules/ledger/utils/writeOffItems";

type WriteOffWording = WriteOffReach | "months";

const WORDING: Record<
  WriteOffWording,
  { title: string; message: string; confirm: string }
> = {
  debts: {
    title: "ledger.write_off_all_title",
    message: "ledger.write_off_all_message",
    confirm: "ledger.write_off_all",
  },
  everything: {
    title: "ledger.write_off_everything_title",
    message: "ledger.write_off_everything_message",
    confirm: "ledger.write_off_everything",
  },
  months: {
    title: "ledger.write_off_months_title",
    message: "ledger.write_off_months_message",
    confirm: "ledger.write_off",
  },
};

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
  const writeOffCharge = useLedgerSlice((s) => s.writeOffCharge);
  const writeOffOwed = useLedgerSlice((s) => s.writeOffOwed);
  const revertWriteOff = useLedgerSlice((s) => s.revertWriteOff);

  const target = useDisplayCurrency();

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

  const confirmWriteOff = useCallback(
    async (
      customerName: string,
      items: OpenItem[],
      wording: WriteOffWording,
    ): Promise<boolean> => {
      if (!user) return false;
      const picked = writeOffItems(
        items,
        wording === "debts" ? "debts" : "everything",
      );
      if (picked.length === 0) return false;
      const text = WORDING[wording];
      let wrote = false;
      await confirm({
        title: t(text.title, { count: picked.length }),
        message: t(text.message, {
          amount: formatMoney(owedUsd(picked), null, target),
          customer: customerName,
          count: picked.length,
        }),
        confirmLabel: t(text.confirm),
        destructive: true,
        onConfirm: async () => {
          wrote = await writeOffOwed(
            picked,
            { tenantId: user.tenantId, userId: user.id },
            null,
          );
        },
      });
      return wrote;
    },
    [user, target, t, writeOffOwed],
  );

  const writeOffAll = useCallback(
    (customerName: string, items: OpenItem[]) =>
      confirmWriteOff(customerName, items, "debts"),
    [confirmWriteOff],
  );

  const writeOffEverything = useCallback(
    (customerName: string, items: OpenItem[]) =>
      confirmWriteOff(customerName, items, "everything"),
    [confirmWriteOff],
  );

  const writeOffMonths = useCallback(
    (customerName: string, items: OpenItem[]) =>
      confirmWriteOff(customerName, items, "months"),
    [confirmWriteOff],
  );

  return { writeOff, revert, writeOffAll, writeOffEverything, writeOffMonths };
}
