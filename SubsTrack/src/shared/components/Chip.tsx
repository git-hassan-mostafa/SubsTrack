import { Text } from "@/src/shared/components/Text";

export type ChipTone =
  | "emerald"
  | "amber"
  | "red"
  | "orange"
  | "sky"
  | "gray"
  | "indigo"
  | "teal"
  | "violet";

export type ChipSize = "sm" | "md";

const TONE_CLASSES: Record<ChipTone, string> = {
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  orange: "bg-orange-50 text-orange-700",
  sky: "bg-sky-50 text-sky-700",
  gray: "bg-gray-100 text-gray-600",
  indigo: "bg-indigo-50 text-indigo-700",
  teal: "bg-teal-50 text-teal-700",
  violet: "bg-violet-50 text-violet-700",
};

const SIZE_CLASSES: Record<ChipSize, string> = {
  sm: "rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
  md: "rounded-full px-3 py-1 text-xs",
};

interface Props {
  text: string;
  tone: ChipTone;
  size?: ChipSize;
}

/** The pill a card or sheet wears to say ONE fact; colours live in a table. */
export function Chip({ text, tone, size = "sm" }: Props) {
  return (
    <Text
      fontWeight={size === "md" ? "SemiBold" : "Regular"}
      className={`${SIZE_CLASSES[size]} ${TONE_CLASSES[tone]}`}
      numberOfLines={1}
    >
      {text}
    </Text>
  );
}
