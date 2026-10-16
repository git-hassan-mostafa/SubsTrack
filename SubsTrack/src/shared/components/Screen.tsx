import type { ReactNode } from "react";
import { View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
  type Edge,
} from "react-native-safe-area-context";

interface Props {
  children: ReactNode;
  edges?: Edge[];
}

// status band = page colour so the flat PageHeader joins it
export function Screen({
  children,
  edges = ["bottom", "left", "right"],
}: Props) {
  const { top } = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-gray-50">
      <View style={{ height: top }} />
      <SafeAreaView className="flex-1" edges={edges}>
        {children}
      </SafeAreaView>
    </View>
  );
}
