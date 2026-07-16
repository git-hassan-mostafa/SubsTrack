import { I18nManager, View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";

interface Props {
  year: number;
  minYear?: number;
  onPrev: () => void;
  onNext: () => void;
}

export function YearNavigator({ year, minYear, onPrev, onNext }: Props) {
  const canGoPrev = minYear === undefined || year > minYear;
  const flip = I18nManager.isRTL ? -1 : 1;

  return (
    <View className="flex-row items-center justify-between px-4 py-3">
      <PressableOpacity
        onPress={onPrev}
        disabled={!canGoPrev}
        className={`w-10 h-10 items-center justify-center rounded-full ${canGoPrev ? "bg-gray-100" : "opacity-30"}`}
      >
        <Text
          style={{ transform: [{ scaleX: flip }] }}
          className="text-gray-700 text-lg font-semibold"
        >
          {"<"}
        </Text>
      </PressableOpacity>
      <Text fontWeight="Bold" className="text-lg text-gray-900">
        {year}
      </Text>
      <PressableOpacity
        onPress={onNext}
        className="w-10 h-10 items-center justify-center rounded-full bg-gray-100"
      >
        <Text
          style={{ transform: [{ scaleX: flip }] }}
          className="text-gray-700 text-lg font-semibold"
        >
          ›
        </Text>
      </PressableOpacity>
    </View>
  );
}
