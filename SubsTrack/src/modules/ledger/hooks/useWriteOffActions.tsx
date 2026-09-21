import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { confirm } from "@/src/shared/lib/confirm";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useLedgerSlice } from "@/src/state/hooks/useLedgerSlice";
import { useAuth } from "@/src/modules/authentication/auth";

/** What either confirm needs to name the money — a bill in any shape says it. */
export interface WriteOffTarget {
  chargeId: string | null;
  balance: number;
  currencyId: string | null;
  customerName: string;
}

/**
 * The two write-off doors, said the same way everywhere.
 *
 * A month, a sale and a hand-typed fee are one `charges` row, so giving up on
 * one and changing that mind must read identically wherever it is reached —
 * the debts list, a customer's panel or the bill sheet behind a month cell.
 * The work runs INSIDE the confirm so the button spins until the write lands
 * (gotcha #144), and both writes go through the ledger slice, which announces
 * `owedVersion` for every debts surface to re-read.
 */
export function useWriteOffActions() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const writeOffCharge = useLedgerSlice((s) => s.writeOffCharge);
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

  return { writeOff, revert };
}
