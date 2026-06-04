import { View } from "react-native";

interface Props {
  current: number;
  total: number;
}

export function StepIndicator({ current, total }: Props) {
  return (
    <View className="flex-row gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => {
        const filled = i < current;
        return (
          <View
            key={i}
            className={`w-3 h-3 rounded-full ${
              filled ? "bg-primary" : "bg-gray-200"
            }`}
          />
        );
      })}
    </View>
  );
}
