import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';

export function TenantInactiveScreen() {
  const { t } = useTranslation();
  const logout = useAuthStore((s) => s.logout);

  return (
    <SafeAreaView className="flex-1 bg-white items-center justify-center px-8">
      <View className="w-16 h-16 rounded-full bg-red-100 items-center justify-center mb-6">
        <Text className="text-3xl">🔒</Text>
      </View>
      <Text className="text-xl font-bold text-gray-900 text-center mb-3">
        {t('tenant_inactive.title')}
      </Text>
      <Text className="text-sm text-gray-600 text-center mb-2">
        {t('tenant_inactive.message')}
      </Text>
      <Text className="text-xs text-gray-400 text-center mb-8">
        {t('tenant_inactive.contact_hint')}
      </Text>
      <Pressable onPress={logout} className="border border-gray-300 rounded-lg px-6 py-3">
        <Text className="text-gray-700 font-medium">{t('common.back')}</Text>
      </Pressable>
    </SafeAreaView>
  );
}
