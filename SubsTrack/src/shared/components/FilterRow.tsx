import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "@/src/shared/components/Text";

interface Props {
  label: string;
  children: ReactNode;
}

// Label padded like the value box so it lines up under a From/To caption too.
export function FilterRow({ label, children }: Props) {
  return (
    <View className="flex-row items-end gap-x-3">
      <View className="w-28 py-2.5 border border-transparent">
        <Text
          fontWeight="Medium"
          className="text-sm text-gray-600"
          numberOfLines={2}
        >
          {label}
        </Text>
      </View>
      <View className="flex-1 flex-row items-end gap-x-2">{children}</View>
    </View>
  );
}
