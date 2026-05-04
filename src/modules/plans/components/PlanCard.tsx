import { Pressable, Text, View } from 'react-native';
import { formatCurrency } from '@/src/core/utils/date';
import type { Plan } from '@/src/core/types';

interface Props {
  plan: Plan;
  onEdit: (plan: Plan) => void;
  onDelete: (plan: Plan) => void;
}

export function PlanCard({ plan, onEdit, onDelete }: Props) {
  return (
    <View className="bg-white border border-gray-200 rounded-lg px-4 py-3 mb-3 flex-row items-center justify-between">
      <View className="flex-1">
        <Text className="text-base font-semibold text-gray-900">{plan.name}</Text>
        <Text className="text-sm text-gray-500 mt-0.5">
          {plan.isCustomPrice ? 'Custom pricing' : formatCurrency(plan.price!)}
        </Text>
      </View>
      <View className="flex-row gap-3">
        <Pressable onPress={() => onEdit(plan)} className="py-1 px-3">
          <Text className="text-primary font-medium text-sm">Edit</Text>
        </Pressable>
        <Pressable onPress={() => onDelete(plan)} className="py-1 px-3">
          <Text className="text-danger font-medium text-sm">Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}
