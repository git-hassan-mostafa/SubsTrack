import { View } from "react-native";
import { Text } from "./Text";

// The sticky month header for the grouped transaction lists (Sales / Payments /
// Debts). "This Month", "June 2026", etc. bg-white so it hides list rows while
// pinned. Sits flush with the list's horizontal padding.
export function MonthSectionHeader({ title }: { title: string }) {
  return (
    <View className="pt-3 pb-1.5">
      <Text
        fontWeight="SemiBold"
        className="text-xs uppercase tracking-wide text-gray-500"
      >
        {title}
      </Text>
    </View>
  );
}
