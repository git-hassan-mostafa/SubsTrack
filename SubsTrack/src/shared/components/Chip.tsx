import { Text } from "@/src/shared/components/Text";

interface Props {
  text: string;
  /** The tint, as Tailwind background + text, e.g. "bg-red-50 text-red-700". */
  className: string;
}

/** The small caps pill a list card wears to say one fact about the row. */
export function Chip({ text, className }: Props) {
  return (
    <Text
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${className}`}
      numberOfLines={1}
    >
      {text}
    </Text>
  );
}
