import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "@/src/shared/components/Text";

interface LineProps {
  children: ReactNode;
  numberOfLines?: number;
  className?: string;
}

export type CardAmountTone = "default" | "muted" | "danger";

const AMOUNT_TONE_CLASSES: Record<CardAmountTone, string> = {
  default: "text-gray-900",
  muted: "text-gray-400 line-through",
  danger: "text-red-600",
};

/** The row's name — `className` carries LAYOUT only, never colour or size. */
export function CardTitle({
  children,
  numberOfLines,
  className = "",
}: LineProps) {
  return (
    <Text
      fontWeight="SemiBold"
      className={`text-base text-gray-900 ${className}`}
      numberOfLines={numberOfLines}
    >
      {children}
    </Text>
  );
}

/** The second line: what the row IS. Layout-only `className`. */
export function CardSubtitle({
  children,
  numberOfLines,
  className = "",
}: LineProps) {
  return (
    <Text
      className={`text-xs text-gray-500 ${className}`}
      numberOfLines={numberOfLines}
    >
      {children}
    </Text>
  );
}

/** The quietest line — when, who, or a figure's unit. Layout-only. */
export function CardMeta({
  children,
  numberOfLines,
  className = "",
}: LineProps) {
  return (
    <Text
      className={`text-[11px] text-gray-400 ${className}`}
      numberOfLines={numberOfLines}
    >
      {children}
    </Text>
  );
}

interface AmountProps extends LineProps {
  tone?: CardAmountTone;
}

/** Money on the row's trailing edge; `muted` is voided, `danger` is unpaid. */
export function CardAmount({
  children,
  tone = "default",
  numberOfLines,
  className = "",
}: AmountProps) {
  return (
    <Text
      fontWeight="Bold"
      className={`text-base ${AMOUNT_TONE_CLASSES[tone]} ${className}`}
      numberOfLines={numberOfLines}
    >
      {children}
    </Text>
  );
}

interface CardChipsProps {
  children: ReactNode;
  reserveSpace?: boolean;
}

/** The card's flag row — always the LAST line of the body, never beside a title. */
export function CardChips({ children, reserveSpace = false }: CardChipsProps) {
  return (
    <View
      className={`mt-1 flex-row flex-wrap items-center gap-1 ${
        reserveSpace ? "min-h-[19px]" : ""
      }`}
    >
      {children}
    </View>
  );
}
