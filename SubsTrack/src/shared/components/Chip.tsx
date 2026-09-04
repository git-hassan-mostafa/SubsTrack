import { Text } from "@/src/shared/components/Text";

interface Props {
  text: string;
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
