import { useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import { PressableOpacity } from "./PressableOpacity";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "./Text";
import { COLORS } from "@/src/shared/constants";
import type { Currency } from "@shared/core/types";
import {
  currencyChoices,
  currencyPickOptions,
} from "@shared/core/utils/currency";
import { useLastUsedCurrency } from "@shared/shared/hooks/useLastUsedCurrency";
import { DropdownModal } from "./Dropdown";
import { AppTextInput } from "./AppTextInput";
import { useTextField } from "@/src/shared/hooks/useTextField";
import {
  amountText,
  decimalDigitsOnly,
  parseAmount,
} from "@shared/core/utils/inputText";

interface CurrencyInputProps {
  label?: string;
  labelAction?: ReactNode;
  amount: number | null;
  currencyId: string | null;
  onChange: (next: {
    amount: number | null;
    currencyId: string | null;
  }) => void;
  currencies: Currency[];
  error?: string | null;
  placeholder?: string;
  lockCurrency?: boolean;
  editable?: boolean;
  onFocus?: () => void;
}

// Amount and currency stay AS TYPED, never converted; defaults to the last used.
export function CurrencyInput({
  label,
  labelAction,
  amount,
  currencyId,
  onChange,
  currencies,
  error,
  placeholder,
  lockCurrency = false,
  editable = true,
  onFocus,
}: CurrencyInputProps) {
  const { t } = useTranslation();
  const rememberCurrency = useLastUsedCurrency(
    { amount, currencyId },
    currencies,
    (lastId) => onChange({ amount: null, currencyId: lastId }),
  );

  const activeCurrencies = useMemo(
    () => currencyChoices(currencies, currencyId),
    [currencies, currencyId],
  );
  const selected = useMemo(
    () => activeCurrencies.find((c) => c.id === currencyId) ?? null,
    [activeCurrencies, currencyId],
  );

  const field = useTextField(
    amountText(amount),
    (next) => onChange({ amount: parseAmount(next), currencyId }),
    {
      sanitize: decimalDigitsOnly,
      expectedEcho: (next) => amountText(parseAmount(next)),
    },
  );

  function handleCurrencyChange(nextId: string | null) {
    rememberCurrency(nextId);
    onChange({ amount, currencyId: nextId });
  }

  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <View className="mb-4">
      {label || labelAction ? (
        <View className="flex-row items-center justify-between gap-2 mb-1.5">
          {label ? (
            <Text
              fontWeight="SemiBold"
              className="text-xs text-gray-500 uppercase tracking-wide"
            >
              {label}
            </Text>
          ) : (
            <View />
          )}
          {labelAction}
        </View>
      ) : null}

      <View
        className={`flex-row items-center border rounded-xl bg-white px-4 ${
          error ? "border-danger" : "border-gray-200"
        }`}
      >
        <AppTextInput
          {...field}
          onFocus={onFocus}
          placeholder={placeholder ?? "0.00"}
          placeholderTextColor={COLORS.gray400}
          keyboardType="decimal-pad"
          editable={editable}
          containerClassName="flex-1"
          className="py-3 text-base text-gray-900"
        />

        <PressableOpacity
          onPress={() => {
            if (!lockCurrency) setPickerOpen(true);
          }}
          disabled={lockCurrency}
          className="flex-row items-center ps-3 ms-2 border-s border-gray-100 py-2.5"
        >
          <Text fontWeight="SemiBold" className="text-sm text-gray-700">
            {selected ? selected.code : "USD"}
          </Text>
          {!lockCurrency ? (
            <Ionicons
              name="chevron-down"
              size={14}
              color={COLORS.gray400}
              style={{ marginInlineStart: 4 }}
            />
          ) : null}
        </PressableOpacity>
      </View>

      {error ? <Text className="text-sm text-danger mt-1">{error}</Text> : null}

      <DropdownModal<string>
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t("tenant_settings.currencies_section_title")}
        options={currencyPickOptions(activeCurrencies)}
        value={currencyId}
        onChange={handleCurrencyChange}
        nullable
        nullLabel="USD"
      />
    </View>
  );
}
