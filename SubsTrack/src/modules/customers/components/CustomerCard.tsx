import { Pressable, Text, View } from 'react-native';
import type { Customer } from '@/src/core/types';

interface Props {
  customer: Customer;
  unpaidCount: number;
  onPress: (customer: Customer) => void;
}

const AVATAR_COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#22c55e', '#f59e0b', '#3b82f6'];

function getAvatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getCurrentMonthLabel(): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now = new Date();
  return `${months[now.getMonth()]} ${now.getFullYear()}`;
}

export function CustomerCard({ customer, unpaidCount, onPress }: Props) {
  const initials = getInitials(customer.name);
  const avatarColor = getAvatarColor(customer.name);
  const monthLabel = getCurrentMonthLabel();

  return (
    <Pressable
      onPress={() => onPress(customer)}
      className="bg-white border border-gray-100 rounded-2xl px-4 py-3.5 mb-2.5 flex-row items-center"
    >
      {/* Avatar */}
      <View
        className="w-10 h-10 rounded-xl items-center justify-center me-3 flex-shrink-0"
        style={{ backgroundColor: avatarColor + '22' }}
      >
        <Text className="text-sm font-bold" style={{ color: avatarColor }}>
          {initials}
        </Text>
      </View>

      {/* Name + Plan */}
      <View className="flex-1 me-2">
        <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
          {customer.name}
        </Text>
        <Text className="text-sm text-gray-400 mt-0.5">
          {customer.plan?.name ?? 'No plan'}
        </Text>
      </View>

      {/* Status + Date */}
      <View className="items-end">
        {unpaidCount > 0 ? (
          <View className="bg-red-100 rounded-lg px-2 py-0.5 mb-1">
            <Text className="text-xs font-semibold text-red-500">{unpaidCount}unpaid</Text>
          </View>
        ) : customer.active ? (
          <View className="flex-row items-center gap-1 mb-1">
            <Text className="text-xs font-semibold text-green-600">✓ Paid</Text>
          </View>
        ) : (
          <View className="bg-gray-100 rounded-lg px-2 py-0.5 mb-1">
            <Text className="text-xs font-medium text-gray-500">Inactive</Text>
          </View>
        )}
        <Text className="text-xs text-gray-400">{monthLabel}</Text>
      </View>
    </Pressable>
  );
}
