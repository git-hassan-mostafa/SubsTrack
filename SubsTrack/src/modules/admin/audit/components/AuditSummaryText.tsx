import { Text } from "@/src/shared/components/Text";
import type { SentencePart } from "../utils/sentence";

interface AuditSummaryTextProps {
  parts: SentencePart[];
  className?: string;
  numberOfLines?: number;
}

// Nested Text, not sibling views — a sentence must wrap as one paragraph.
export function AuditSummaryText({
  parts,
  className,
  numberOfLines,
}: AuditSummaryTextProps) {
  return (
    <Text className={className} numberOfLines={numberOfLines}>
      {parts.map((part, i) => (
        <Text key={i} fontWeight={part.bold ? "SemiBold" : "Regular"}>
          {part.text}
        </Text>
      ))}
    </Text>
  );
}
