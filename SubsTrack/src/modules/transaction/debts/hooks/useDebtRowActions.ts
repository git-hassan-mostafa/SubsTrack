import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { OpenItem } from "@/src/core/types";
import { confirm } from "@/src/shared/lib/confirm";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useLedgerSlice } from "@/src/state/hooks/useLedgerSlice";
import { useAuth } from "@/src/modules/authentication/auth";

/**
 * What can be done to ONE bill from a debts list.
 *
 * Collecting is deliberately NOT here: money always goes through the collect
 * sheet, so staff sees the split before it is written. What is left are the two
 * corrections a bill can take, and they are opposites:
 *
 *   void      — the bill was a MISTAKE and never existed. Refused once money
 *               sits on it (void that payment first).
 *   write off — the bill is REAL and will never be paid. It leaves "still owed"
 *               and is reported as a loss.
 */
// No "changed" callback: both writes go through the ledger slice, which bumps
// `owedVersion`, and every debts surface watches it (`useOwedChanged`).
export function useDebtRowActions() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const voidCharge = useLedgerSlice((s) => s.voidCharge);
  const writeOffCharge = useLedgerSlice((s) => s.writeOffCharge);

  const target = findCurrency(currencies, displayCurrencyId);

  const writeOffItem = useCallback(
    async (item: OpenItem) => {
      if (!user || !item.chargeId) return;
      const source = findCurrency(currencies, item.currencyId);
      const ok = await confirm({
        title: t("ledger.write_off_title"),
        message: t("ledger.write_off_message", {
          amount: formatMoney(item.balance, source, target),
          customer: item.customerName,
        }),
        confirmLabel: t("ledger.write_off"),
        destructive: true,
      });
      if (!ok) return;
      await writeOffCharge(item.chargeId, user.id, null);
    },
    [user, currencies, target, t, writeOffCharge],
  );

  const voidItem = useCallback(
    async (item: OpenItem) => {
      // Only a hand-typed fee can be removed from here. A month is voided from
      // its own grid cell and a sale from the sale — each in the place that owns
      // the record, and each taking that record's payments with it.
      if (!user || !item.chargeId || item.kind !== "manual") return;
      const ok = await confirm({
        title: t("debts.void_custom_title"),
        message: t("debts.void_custom_message"),
        confirmLabel: t("common.delete"),
        destructive: true,
      });
      if (!ok) return;
      await voidCharge(item.chargeId, user.id, null);
    },
    [user, t, voidCharge],
  );

  return { voidItem, writeOffItem };
}
