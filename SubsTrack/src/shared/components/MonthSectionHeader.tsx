import { View } from "react-native";
import { Text } from "./Text";

// The sticky month header for the grouped transaction lists (Sales / Payments /
// Debts). "This Month", "June 2026", etc. bg-white so it hides list rows while
// pinned. Sits flush with the list's horizontal padding. `total`, when passed,
// is a preformatted amount string shown at the trailing edge.
export function MonthSectionHeader({
  title,
  count,
  total,
}: {
  title: string;
  count?: number;
  total?: string;
}) {
  return (
    <View className="pt-3 pb-1.5 flex-row items-baseline justify-between">
      <Text
        fontWeight="SemiBold"
        className="text-xs uppercase tracking-wide text-gray-500"
      >
        {title} {count && ` (${count})`}
      </Text>
      {total ? (
        <Text
          fontWeight="SemiBold"
          className="text-xs uppercase tracking-wide text-gray-500"
        >
          {total}
        </Text>
      ) : null}
    </View>
  );
}
