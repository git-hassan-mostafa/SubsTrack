import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { COLORS } from "@/src/shared/constants";

export interface RankedRow {
  key: string;
  label: string;
  sub?: string;
  amount: string;
  tone?: "default" | "danger";
}

interface Props {
  rows: RankedRow[];
  emptyLabel: string;
  onPressRow?: (key: string) => void;
}

/** Top-N list with a rank number. Used for debtors, staff and products. */
export function RankedList({ rows, emptyLabel, onPressRow }: Props) {
  if (rows.length === 0) {
    return <Text className="text-xs text-gray-400 py-4 text-center">{emptyLabel}</Text>;
  }

  return (
    <View>
      {rows.map((row, i) => {
        const body = (
          <View className="flex-row items-center gap-3 py-2.5">
            <View className="w-6 h-6 rounded-full bg-gray-100 items-center justify-center">
              <Text className="text-xs text-gray-500">{i + 1}</Text>
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-sm text-gray-900" numberOfLines={1}>
                {row.label}
              </Text>
              {row.sub ? (
                <Text className="text-xs text-gray-400" numberOfLines={1}>
                  {row.sub}
                </Text>
              ) : null}
            </View>
            <Text
              fontWeight="Bold"
              className={`text-sm ${row.tone === "danger" ? "text-danger" : "text-gray-900"}`}
            >
              {row.amount}
            </Text>
            {onPressRow ? (
              <Ionicons name="chevron-forward" size={14} color={COLORS.gray400} />
            ) : null}
          </View>
        );
        return onPressRow ? (
          <PressableOpacity key={row.key} onPress={() => onPressRow(row.key)}>
            {body}
          </PressableOpacity>
        ) : (
          <View key={row.key}>{body}</View>
        );
      })}
    </View>
  );
}
