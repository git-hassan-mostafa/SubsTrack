import { View } from "react-native";
import { Text } from "./Text";

// The sticky month header for the grouped transaction lists (Sales / Payments /
// Debts). "This Month", "June 2026", etc. bg-white so it hides list rows while
// pinned. Sits flush with the list's horizontal padding. `total`, when passed,
// is a preformatted amount string shown at the trailing edge.
//
// `totals` is the alternative for lists that mix money IN and money OUT (the
// debt history): each entry is shown in its own colour side by side, so the two
// sums stay readable instead of collapsing into one net figure. Pass either
// `total` or `totals`, not both.
//
// A short centered bar + extra space separates each group from the one above it.
// It's a real element, not a `border-t`, so it can be inset from both edges and
// thicker than a hairline. Pass `first` on the top section to skip it.
export interface SectionTotal {
  text: string;
  className: string;
}

export function MonthSectionHeader({
  title,
  count,
  total,
  totals,
  first = false,
}: {
  title: string;
  count?: number;
  total?: string;
  totals?: SectionTotal[];
  first?: boolean;
}) {
  return (
    <View>
      {first ? null : (
        <View className="items-center py-4">
          <View className="h-[3px] w-16 rounded-full bg-gray-200" />
        </View>
      )}
      <View
        className={`pb-1.5 flex-row items-baseline justify-between ${
          first ? "pt-3" : ""
        }`}
      >
        <Text
          fontWeight="SemiBold"
          className="text-xs uppercase tracking-wide text-gray-500"
        >
          {title} {count && ` (${count})`}
        </Text>
        {totals?.length ? (
          <View className="flex-row items-baseline gap-2">
            {totals.map((entry) => (
              <Text
                key={entry.className}
                fontWeight="SemiBold"
                className={`text-xs uppercase tracking-wide ${entry.className}`}
              >
                {entry.text}
              </Text>
            ))}
          </View>
        ) : total ? (
          <Text
            fontWeight="SemiBold"
            className="text-xs uppercase tracking-wide text-gray-500"
          >
            {total}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
