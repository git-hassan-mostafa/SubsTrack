import type { Plan } from '@/src/core/types';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  plan: Plan;
  onEdit: (plan: Plan) => void;
  onDelete: (plan: Plan) => void;
}

export function PlanCard({ plan, onEdit, onDelete }: Props) {
  return (
    <Pressable
      onPress={() => onEdit(plan)}
      className="bg-white border border-gray-100 rounded-2xl px-4 py-4 mb-2.5 flex-row items-center"
    >
      {/* Icon */}
      <View className="w-10 h-10 rounded-xl bg-indigo-50 items-center justify-center me-3">
        <Ionicons name="pulse-outline" size={18} color="#6366f1" />
      </View>

      {/* Name + count placeholder */}
      <View className="flex-1">
        <Text className="text-base font-semibold text-gray-900">{plan.name}</Text>
        <Text className="text-xs text-gray-400 mt-0.5">
          {plan.isCustomPrice ? 'Custom pricing' : '—'}
        </Text>
      </View>

      {/* Price */}
      <View className="items-end me-2">
        {plan.isCustomPrice ? (
          <Text className="text-base font-semibold text-gray-400">Custom</Text>
        ) : (
          <>
            <Text className="text-base font-bold text-gray-900">${plan.price}</Text>
            <Text className="text-xs text-gray-400">per month</Text>
          </>
        )}
      </View>

      <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
    </Pressable>
  );
}
