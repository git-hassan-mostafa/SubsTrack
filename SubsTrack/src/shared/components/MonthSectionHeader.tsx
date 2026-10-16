import { View } from "react-native";
import { Text } from "./Text";

export interface SectionTotal {
  text: string;
  className: string;
}

// `totals` keeps money in and out apart, never one net figure
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
    <View
      className={`bg-gray-50 pb-2 flex-row items-baseline justify-between ${
        first ? "pt-2" : "pt-5"
      }`}
    >
      <Text fontWeight="SemiBold" className="text-sm text-gray-700">
        {title}
        {count ? <Text className="text-sm text-gray-500">{` (${count})`}</Text> : null}
      </Text>
      {totals?.length ? (
        <View className="flex-row items-baseline gap-2">
          {totals.map((entry) => (
            <Text
              key={entry.className}
              fontWeight="SemiBold"
              className={`text-sm ${entry.className}`}
            >
              {entry.text}
            </Text>
          ))}
        </View>
      ) : total ? (
        <Text fontWeight="SemiBold" className="text-sm text-gray-600">
          {total}
        </Text>
      ) : null}
    </View>
  );
}
