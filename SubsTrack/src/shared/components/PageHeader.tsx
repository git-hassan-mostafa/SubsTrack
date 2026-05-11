import { Pressable, View } from 'react-native';
import { Text } from '@/src/shared/components/Text';
import { DirectionalIcon } from '@/src/shared/components/DirectionalIcon';
import { COLORS } from '@/src/shared/constants';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  actionLabel?: string;
  onAction?: () => void;
}

export function PageHeader({ title, subtitle, showBack, onBack, actionLabel, onAction }: PageHeaderProps) {
  return (
    <View className="flex-row items-center px-4 pt-4 pb-4 bg-white border-b border-gray-100 gap-2">
      {showBack ? (
        <Pressable onPress={onBack} className="p-1 me-1">
          <DirectionalIcon name="chevron-back" size={22} color={COLORS.primary} />
        </Pressable>
      ) : null}
      <View className="flex-1 min-w-0">
        <Text fontWeight="Bold" className="text-2xl text-gray-900">{title}</Text>
        {subtitle ? (
          <Text className="text-sm text-gray-400 mt-0.5">{subtitle}</Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} className="bg-primary rounded-full px-4 py-2">
          <Text className="text-white font-semibold text-sm">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
