import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { OpenItem } from "@/src/core/types";
import { confirm } from "@/src/shared/lib/confirm";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useLedgerSlice } from "@/src/state/hooks/useLedgerSlice";
import { useAuth } from "@/src/modules/authentication/auth";

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
