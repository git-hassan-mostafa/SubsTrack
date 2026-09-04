import { View } from "react-native";
import { Text } from "./Text";

export interface InfoRow {
  label: string;
  value: string | null | undefined;
}

/**
 * A record's "label → value" block, as the detail sheets print it.
 *
 * Rows with nothing to say are dropped here rather than by every caller, which
 * is what lets a sheet list every field it MIGHT have and stay short.
 */
export function InfoRows({ rows }: { rows: InfoRow[] }) {
  const filled = rows.filter((r) => !!r.value);
  if (filled.length === 0) return null;
  return (
    <View className="gap-2 rounded-xl bg-slate-50 px-4 py-3">
      {filled.map((row) => (
        <View key={row.label} className="flex-row items-start justify-between gap-3">
          <Text className="text-sm text-slate-600">{row.label}</Text>
          <Text className="flex-1 text-end text-sm text-slate-900">{row.value}</Text>
        </View>
      ))}
    </View>
  );
}
