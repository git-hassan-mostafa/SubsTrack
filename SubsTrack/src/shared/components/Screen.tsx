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

// Status-bar band stays white to join the white PageHeader; `edges` = the rest
export function Screen({
  children,
  edges = ["bottom", "left", "right"],
}: Props) {
  const { top } = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-white" style={{ height: top }} />
      <SafeAreaView className="flex-1" edges={edges}>
        {children}
      </SafeAreaView>
    </View>
  );
}
