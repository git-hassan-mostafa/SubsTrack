import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { Branch } from '@/src/core/types';
import { Text } from '@/src/shared/components/Text';
import { DirectionalIcon } from '@/src/shared/components/DirectionalIcon';
import { COLORS } from '@/src/shared/constants';

interface Props {
  branch: Branch;
  onEdit: (branch: Branch) => void;
}

export function BranchCard({ branch, onEdit }: Props) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={() => onEdit(branch)}
      className={`bg-white border rounded-2xl px-4 py-4 mb-2.5 flex-row items-center ${
        branch.active ? 'border-gray-100' : 'border-gray-200 opacity-60'
      }`}
    >
      <View className="w-10 h-10 rounded-xl bg-indigo-50 items-center justify-center me-3">
        <Ionicons name="business-outline" size={18} color={COLORS.primary} />
      </View>

      <View className="flex-1">
        <View className="flex-row items-center">
          <Text className="text-base font-semibold text-gray-900">{branch.name}</Text>
          {!branch.active ? (
            <View className="bg-gray-100 rounded-lg px-2 py-0.5 ms-2">
              <Text className="text-[10px] font-semibold text-gray-500 uppercase">
                {t('common.inactive')}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <DirectionalIcon name="chevron-forward" size={16} color={COLORS.gray300} />
    </Pressable>
  );
}
