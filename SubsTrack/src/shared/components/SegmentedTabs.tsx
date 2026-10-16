import { View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
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

// page-level switcher (Transactions hub) and a per-row choice (sale line kind)
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
            containerClassName={`flex-1 rounded-full ${
              active ? "bg-white elevation-sm" : ""
            }`}
            className="py-2 items-center"
          >
            <Text
              fontWeight={active ? "SemiBold" : "Medium"}
              className="text-sm"
              style={{ color: active ? COLORS.gray900 : COLORS.gray600 }}
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
