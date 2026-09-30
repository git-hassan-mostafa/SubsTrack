import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Alert from "@mui/material/Alert";
import TextField from "@mui/material/TextField";
import type { Currency } from "@shared/core/types";
import { decimalDigitsOnly, digitsOnly, upperCaseText } from "@shared/core/utils/inputText";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useDirtyForm } from "@shared/shared/hooks/useDirtyForm";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { FormDialog } from "@/shared/components/FormDialog";

interface CurrencyFormDialogProps {
  currency: Currency | null;
  onClose: () => void;
  onSaved: (saved: Currency) => void;
}

type CurrencyForm = {
  code: string;
  name: string;
  symbol: string;
  rateText: string;
  decimalsText: string;
};

export function CurrencyFormDialog({ currency, onClose, onSaved }: CurrencyFormDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const createCurrency = useCurrencySlice((s) => s.createCurrency);
  const updateCurrency = useCurrencySlice((s) => s.updateCurrency);
  const error = useCurrencySlice((s) => s.error);
  const clearError = useCurrencySlice((s) => s.clearError);
  const [form, setForm] = useState<CurrencyForm>({
    code: currency?.code ?? "",
    name: currency?.name ?? "",
    symbol: currency?.symbol ?? "",
    rateText: currency ? String(currency.ratePerUsd) : "",
    decimalsText: currency ? String(currency.decimals) : "2",
  });
  const dirty = useDirtyForm(form);

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  const change = (patch: Partial<CurrencyForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    if (error) clearError();
  };

  const submit = async () => {
    if (!user) return;
    const data = {
      code: form.code,
      name: form.name,
      symbol: form.symbol.trim() || null,
      ratePerUsd: parseFloat(form.rateText),
      decimals: parseInt(form.decimalsText, 10),
    };
    const saved = currency
      ? await updateCurrency(currency.id, data)
      : await createCurrency(data, user.tenantId);
    if (saved) onSaved(saved);
  };

  const rateCode = form.code || t("tenant_settings.rate_label_fallback");

  return (
    <FormDialog
      open
      title={currency ? t("tenant_settings.edit_currency") : t("web.currencies.add")}
      onClose={onClose}
      onSubmit={submit}
      dirty={dirty}
      error={error}
      onDismissError={clearError}
      submitLabel={currency ? t("common.save_changes") : t("web.currencies.add")}
    >
      {currency && !currency.active ? (
        <Alert severity="warning">{t("tenant_settings.inactive_currency_note")}</Alert>
      ) : null}
      <TextField
        label={t("tenant_settings.code_label")}
        value={form.code}
        onChange={(event) => change({ code: upperCaseText(event.target.value) })}
        placeholder={t("tenant_settings.code_placeholder")}
        required
        autoFocus
        fullWidth
        slotProps={{ htmlInput: { maxLength: 8 } }}
      />
      <TextField
        label={t("tenant_settings.name_label")}
        value={form.name}
        onChange={(event) => change({ name: event.target.value })}
        placeholder={t("tenant_settings.name_placeholder")}
        required
        fullWidth
      />
      <TextField
        label={t("tenant_settings.symbol_label")}
        value={form.symbol}
        onChange={(event) => change({ symbol: event.target.value })}
        placeholder={t("tenant_settings.symbol_placeholder")}
        fullWidth
        slotProps={{ htmlInput: { maxLength: 6 } }}
      />
      <TextField
        label={t("tenant_settings.rate_label", { code: rateCode })}
        value={form.rateText}
        onChange={(event) => change({ rateText: decimalDigitsOnly(event.target.value) })}
        placeholder="0"
        helperText={t("tenant_settings.rate_hint", { code: form.code || "XXX" })}
        required
        fullWidth
        slotProps={{ htmlInput: { inputMode: "decimal" } }}
      />
      <TextField
        label={t("tenant_settings.decimals_label")}
        value={form.decimalsText}
        onChange={(event) =>
          change({ decimalsText: digitsOnly(event.target.value).slice(0, 1) })
        }
        placeholder="2"
        required
        fullWidth
        slotProps={{ htmlInput: { inputMode: "numeric" } }}
      />
    </FormDialog>
  );
}
