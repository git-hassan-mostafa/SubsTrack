import { View } from "react-native";
import { StatTile } from "@/src/shared/components/StatTile";
import type { Delta } from "../utils/aggregate";
import { ComparisonPill } from "./ComparisonPill";

export interface Kpi {
  key: string;
  label: string;
  // Numbers are allowed (counts), matching StatTile.
  value: string | number;
  sub?: string;
  tone?: "default" | "danger" | "success" | "warning" | "primary";
  delta?: Delta;
  higherIsBetter?: boolean;
}

/**
 * A grid of KPI tiles, two per row. Built on the shared StatTile so a report
 * headline and a dashboard tile can never drift apart visually.
 */
export function KpiRow({ items }: { items: Kpi[] }) {
  return (
    <View className="flex-row flex-wrap gap-3">
      {items.map((k) => (
        <View key={k.key} className="flex-1 min-w-[45%]">
          <StatTile label={k.label} value={k.value} sub={k.sub} tone={k.tone} />
          {k.delta ? (
            <View className="mt-1 ps-1">
              <ComparisonPill delta={k.delta} higherIsBetter={k.higherIsBetter} />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}
