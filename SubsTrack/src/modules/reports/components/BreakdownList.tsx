import { View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";

export interface BreakdownRow {
  key: string;
  label: string;
  amount: string;
  share: number;
  color: string;
  count?: number;
}

interface Props {
  rows: BreakdownRow[];
  emptyLabel: string;
  onPressRow?: (key: string) => void;
}

/** label · inline share bar · amount. The shape of every "by X" breakdown. */
export function BreakdownList({ rows, emptyLabel, onPressRow }: Props) {
  if (rows.length === 0) {
    return <Text className="text-xs text-gray-400 py-4 text-center">{emptyLabel}</Text>;
  }

  return (
    <View className="gap-3">
      {rows.map((row) => {
        const body = (
          <View className="gap-1.5">
            <View className="flex-row items-center gap-2">
              <Text className="flex-1 text-sm text-gray-700" numberOfLines={1}>
                {row.label}
              </Text>
              <Text fontWeight="Bold" className="text-sm text-gray-900">
                {row.amount}
              </Text>
              <Text className="text-xs text-gray-400 w-9 text-end">
                {Math.round(row.share * 100)}%
              </Text>
            </View>
            <View className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <View
                className="h-full rounded-full"
                style={{
                  width: `${row.share === 0 ? 0 : Math.max(row.share * 100, 2)}%`,
                  backgroundColor: row.color,
                }}
              />
            </View>
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
