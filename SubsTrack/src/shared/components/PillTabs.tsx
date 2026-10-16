import { ScrollView } from "react-native";
import { FilterChip } from "@/src/shared/components/FilterChip";

export interface PillTab<T extends string> {
  key: T;
  label: string;
}

interface PillTabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  tabs: PillTab<T>[];
  className?: string;
}

// one line that scrolls sideways; persisted taps so a tap under a search box picks
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
      {tabs.map((tab) => (
        <FilterChip
          key={tab.key}
          label={tab.label}
          active={tab.key === value}
          onPress={() => onChange(tab.key)}
        />
      ))}
    </ScrollView>
  );
}
