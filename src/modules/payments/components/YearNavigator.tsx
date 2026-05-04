import { Pressable, Text, View } from 'react-native';

interface Props {
  year: number;
  minYear?: number;
  onPrev: () => void;
  onNext: () => void;
}

export function YearNavigator({ year, minYear, onPrev, onNext }: Props) {
  const canGoPrev = minYear === undefined || year > minYear;

  return (
    <View className="flex-row items-center justify-between px-4 py-3">
      <Pressable
        onPress={onPrev}
        disabled={!canGoPrev}
        className={`w-10 h-10 items-center justify-center rounded-full ${canGoPrev ? 'bg-gray-100' : 'opacity-30'}`}
      >
        <Text className="text-gray-700 text-lg font-semibold">‹</Text>
      </Pressable>
      <Text className="text-lg font-bold text-gray-900">{year}</Text>
      <Pressable
        onPress={onNext}
        className="w-10 h-10 items-center justify-center rounded-full bg-gray-100"
      >
        <Text className="text-gray-700 text-lg font-semibold">›</Text>
      </Pressable>
    </View>
  );
}
