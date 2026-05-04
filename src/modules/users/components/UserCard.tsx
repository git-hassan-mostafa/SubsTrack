import { Pressable, Text, View } from 'react-native';
import type { AppUser } from '@/src/core/types';

interface Props {
  user: AppUser;
  onEdit: (user: AppUser) => void;
}

const roleBadge: Record<string, string> = {
  admin: 'bg-indigo-100 text-indigo-700',
  user:  'bg-gray-100 text-gray-600',
};

export function UserCard({ user, onEdit }: Props) {
  return (
    <Pressable
      onPress={() => onEdit(user)}
      className="bg-white border border-gray-200 rounded-lg px-4 py-3 mb-3 flex-row items-center justify-between"
    >
      <View className="flex-1">
        <Text className="text-base font-semibold text-gray-900">{user.username}</Text>
        {user.phoneNumber ? (
          <Text className="text-sm text-gray-500 mt-0.5">{user.phoneNumber}</Text>
        ) : null}
      </View>
      <View className={`rounded-full px-3 py-1 ${roleBadge[user.role] ?? 'bg-gray-100 text-gray-600'}`}>
        <Text className="text-xs font-medium capitalize">{user.role}</Text>
      </View>
    </Pressable>
  );
}
