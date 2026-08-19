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

const PER_ROW = 2;

/**
 * A grid of KPI tiles, two per row. Built on the shared StatTile so a report
 * headline and a dashboard tile can never drift apart visually.
 *
 * Rows are chunked explicitly instead of using `flex-wrap`: on Yoga a wrapped
 * line gets stretched to share the container's cross size, which blew each
 * tile up to half the screen height on Android (web was unaffected). The tile
 * also sits in its own `flex-row` wrapper so its built-in `flex-1` grows
 * sideways — inside a plain column cell it would grow downward instead.
 */
export function KpiRow({ items }: { items: Kpi[] }) {
  const rows: Kpi[][] = [];
  for (let i = 0; i < items.length; i += PER_ROW) {
    rows.push(items.slice(i, i + PER_ROW));
  }

  return (
    <View className="gap-3">
      {rows.map((row, index) => (
        <View key={index} className="flex-row gap-3">
          {row.map((k) => (
            <View key={k.key} className="flex-1">
              <View className="flex-row">
                <StatTile label={k.label} value={k.value} sub={k.sub} tone={k.tone} />
              </View>
              {k.delta ? (
                <View className="mt-1 ps-1">
                  <ComparisonPill delta={k.delta} higherIsBetter={k.higherIsBetter} />
                </View>
              ) : null}
            </View>
          ))}
          {/* Keeps a lone last tile half width instead of stretching it. */}
          {row.length < PER_ROW ? <View className="flex-1" /> : null}
        </View>
      ))}
    </View>
  );
}
