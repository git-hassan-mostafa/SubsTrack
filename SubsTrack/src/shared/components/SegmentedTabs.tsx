import { View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "./PressableOpacity";

export interface Segment<T extends string> {
  key: T;
  label: string;
}

interface SegmentedTabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  segments: Segment<T>[];
}

// iOS-style segmented control: a pill track with one highlighted segment.
// Used as the in-page tab switcher (e.g. the Transactions hub: Sales / Payments / Services).
export function SegmentedTabs<T extends string>({
  value,
  onChange,
  segments,
}: SegmentedTabsProps<T>) {
  return (
    <View className="flex-row bg-gray-100 rounded-full p-1">
      {segments.map((seg) => {
        const active = seg.key === value;
        return (
          <PressableOpacity
            key={seg.key}
            onPress={() => onChange(seg.key)}
            className={`flex-1 rounded-full py-2 items-center ${
              active ? "bg-white" : ""
            }`}
          >
            <Text
              fontWeight={active ? "SemiBold" : undefined}
              className={`text-sm ${active ? "text-gray-900" : "text-gray-500"}`}
              numberOfLines={1}
            >
              {seg.label}
            </Text>
          </PressableOpacity>
        );
      })}
    </View>
  );
}
