import { useEffect, useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { Input } from "@/src/shared/components/Input";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import type { Currency } from "@/src/core/types";
import { useCurrencyStore } from "../store/currencyStore";

interface Props {
  currency?: Currency | null;
  onDismiss: () => void;
  onRequestDelete?: (currency: Currency) => void;
}

type FormState = {
  code: string;
  name: string;
  symbol: string;
  rateText: string;
  decimalsText: string;
};

export function CurrencyFormSheet({
  currency,
  onDismiss,
  onRequestDelete,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const {
    createCurrency,
    updateCurrency,
    reactivateCurrency,
    loading,
    error,
    clearError,
  } = useCurrencyStore();

  const [form, setForm] = useState<FormState>({
    code: currency?.code ?? "",
    name: currency?.name ?? "",
    symbol: currency?.symbol ?? "",
    rateText: currency?.ratePerUsd != null ? String(currency.ratePerUsd) : "",
    decimalsText: currency?.decimals != null ? String(currency.decimals) : "2",
  });

  useEffect(() => {
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit() {
    if (!user) return;
    const data = {
      code: form.code,
      name: form.name,
      symbol: form.symbol.trim() || null,
      ratePerUsd: parseFloat(form.rateText),
      decimals: parseInt(form.decimalsText, 10),
    };
    if (currency) {
      await updateCurrency(currency.id, data);
    } else {
      await createCurrency(data, user.tenantId);
    }
    if (!useCurrencyStore.getState().error) onDismiss();
  }

  async function handleReactivate() {
    if (!currency) return;
    await reactivateCurrency(currency.id);
    if (!useCurrencyStore.getState().error) onDismiss();
  }

  const submitDisabled =
    !form.code.trim() ||
    !form.name.trim() ||
    !form.rateText ||
    !form.decimalsText ||
    loading;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View className="flex-1 bg-white">
        <View className="items-center pt-3 pb-1">
          <View className="w-10 h-1 rounded-full bg-gray-300" />
        </View>
        <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
          <Text fontWeight="Bold" className="text-lg text-gray-900">
            {currency
              ? t("tenant_settings.edit_currency")
              : t("tenant_settings.add_currency")}
          </Text>
          <PressableOpacity onPress={onDismiss}>
            <Text className="text-base text-primary font-medium">
              {t("common.cancel")}
            </Text>
          </PressableOpacity>
        </View>

        <ScrollView
          className="flex-1 px-6 pt-6"
          keyboardShouldPersistTaps="handled"
        >
          {error ? (
            <ErrorBanner message={error} onDismiss={clearError} />
          ) : null}

          {currency && !currency.active ? (
            <View className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
              <Text className="text-sm text-amber-800">
                {t("tenant_settings.inactive_currency_note")}
              </Text>
            </View>
          ) : null}

          <Input
            label={t("tenant_settings.code_label") + " *"}
            value={form.code}
            onChangeText={(v) =>
              setForm((p) => ({ ...p, code: v.toUpperCase() }))
            }
            placeholder={t("tenant_settings.code_placeholder")}
            autoCapitalize="characters"
            maxLength={8}
            onFocus={clearError}
          />

          <Input
            label={t("tenant_settings.name_label") + " *"}
            value={form.name}
            onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
            placeholder={t("tenant_settings.name_placeholder")}
            onFocus={clearError}
          />

          <Input
            label={t("tenant_settings.symbol_label")}
            value={form.symbol}
            onChangeText={(v) => setForm((p) => ({ ...p, symbol: v }))}
            placeholder={t("tenant_settings.symbol_placeholder")}
            maxLength={6}
            onFocus={clearError}
          />

          <Input
            label={
              t("tenant_settings.rate_label", {
                code: form.code || t("tenant_settings.rate_label_fallback"),
              }) + " *"
            }
            value={form.rateText}
            onChangeText={(v) =>
              setForm((p) => ({ ...p, rateText: v.replace(/[^0-9.]/g, "") }))
            }
            placeholder="0"
            keyboardType="decimal-pad"
            onFocus={clearError}
          />
          <Text className="text-xs text-gray-400 -mt-3 mb-4">
            {t("tenant_settings.rate_hint", { code: form.code || "XXX" })}
          </Text>

          <Input
            label={t("tenant_settings.decimals_label") + " *"}
            value={form.decimalsText}
            onChangeText={(v) =>
              setForm((p) => ({
                ...p,
                decimalsText: v.replace(/[^0-9]/g, "").slice(0, 1),
              }))
            }
            placeholder="2"
            keyboardType="number-pad"
            onFocus={clearError}
          />

          <Button
            label={
              currency
                ? t("common.save_changes")
                : t("tenant_settings.add_currency")
            }
            onPress={handleSubmit}
            loading={loading}
            disabled={submitDisabled}
            fullWidth
          />

          {currency && currency.active && onRequestDelete ? (
            <PressableOpacity
              onPress={() => onRequestDelete(currency)}
              className="border border-red-200 rounded-xl py-3.5 items-center mt-3"
            >
              <Text className="text-red-500 font-semibold">
                {t("common.delete")}
              </Text>
            </PressableOpacity>
          ) : null}

          {currency && !currency.active ? (
            <PressableOpacity
              onPress={handleReactivate}
              className="border border-indigo-200 rounded-xl py-3.5 items-center mt-3"
            >
              <Text className="text-primary font-semibold">
                {t("tenant_settings.reactivate")}
              </Text>
            </PressableOpacity>
          ) : null}

          <View className="h-6" />
        </ScrollView>
      </View>
    </Modal>
  );
}
