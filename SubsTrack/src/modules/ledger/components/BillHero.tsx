import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import type { BillState } from "../utils/billState";

interface Props {
  state: BillState;
  amount: string;
  approx?: string | null;
  caption?: string | null;
  note?: string | null;
}

/**
 * The tinted status card both the month bill sheet and the sale receipt open
 * with — one component so a written-off month and a written-off sale cannot
 * drift into different colours, glyphs or amount formats.
 *
 * `amount` is already formatted by the caller, because only the caller knows
 * whether the figure is a total or a collected/owed fraction.
 */
export function BillHero({ state, amount, approx, caption, note }: Props) {
  const { t } = useTranslation();

  return (
    <View
      className={`mb-4 items-center rounded-2xl border px-4 py-5 ${state.card}`}
    >
      <View
        className={`mb-3 h-10 w-10 items-center justify-center rounded-full ${state.badge}`}
      >
        <Text fontWeight="Bold" className="text-lg text-white">
          {state.glyph}
        </Text>
      </View>
      <Text fontWeight="Bold" className={`text-3xl ${state.amount}`}>
        {amount}
      </Text>
      {approx ? (
        <Text className="mt-0.5 text-xs text-gray-400">{approx}</Text>
      ) : null}
      {caption ? (
        <Text className="mt-1 text-sm text-gray-400">{caption}</Text>
      ) : null}
      {note ? (
        <Text className="mt-1 text-sm text-gray-600">{note}</Text>
      ) : null}
      <View className={`mt-2 rounded-full px-3 py-1 ${state.bg}`}>
        <Text fontWeight="SemiBold" className={`text-xs ${state.text}`}>
          {t(state.labelKey)}
        </Text>
      </View>
    </View>
  );
}
