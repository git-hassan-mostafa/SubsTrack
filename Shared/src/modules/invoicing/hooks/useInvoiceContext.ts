import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { InvoiceContext } from "@shared/modules/invoicing/utils/invoiceText";
import { useAuthSlice } from "@shared/state/hooks/useAuthSlice";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";

// Rebuilt on a language switch, so a receipt is written in the language on screen.
export function useInvoiceContext(): InvoiceContext {
  const { t, i18n } = useTranslation();
  const orgName = useAuthSlice((s) => s.user?.tenant.name ?? "");
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const language = i18n.language;
  return useMemo(
    () => ({ t, orgName, currencies, displayCurrencyId }),
    [t, orgName, language, currencies, displayCurrencyId],
  );
}
