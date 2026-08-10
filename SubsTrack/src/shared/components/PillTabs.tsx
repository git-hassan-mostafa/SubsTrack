import { ScrollView } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";

export interface PillTab<T extends string> {
  key: T;
  label: string;
}

interface PillTabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  tabs: PillTab<T>[];
  /** Extra classes on the row (e.g. spacing). */
  className?: string;
}

// A row of dark toggle pills — active pill is solid (bg-gray-900), the rest are
// light (bg-gray-100). Used as a lightweight secondary tab/filter switch (the
// customer-list filter tabs, the inner Debts sub-tabs). Distinct from the
// SegmentedTabs pill track so nested levels read as different levels.
// The row stays ONE line and scrolls sideways — the customer list carries eight
// tabs, which never fit a phone screen. `keyboardShouldPersistTaps` because the
// row sits right under a search box: a tap must pick the tab, not just close the
// keyboard.
export function PillTabs<T extends string>({
  value,
  onChange,
  tabs,
  className = "",
}: PillTabsProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      className={className}
      contentContainerStyle={{ gap: 8, alignItems: "center" }}
    >
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <PressableOpacity
            key={tab.key}
            onPress={() => onChange(tab.key)}
            className={`rounded-full px-3 py-1.5 ${active ? "bg-gray-900" : "bg-gray-100"}`}
          >
            <Text
              className={`text-xs font-semibold ${active ? "text-white" : "text-gray-600"}`}
            >
              {tab.label}
            </Text>
          </PressableOpacity>
        );
      })}
    </ScrollView>
  );
}
