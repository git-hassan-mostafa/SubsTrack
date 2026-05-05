import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function AdminLayout() {
  const { t } = useTranslation();

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: t('admin.title'), headerShown: false }} />
      <Stack.Screen name="dashboard" options={{ title: t('dashboard.title') }} />
      <Stack.Screen name="users" options={{ title: t('users.title') }} />
      <Stack.Screen name="plans" options={{ title: t('plans.title') }} />
    </Stack>
  );
}
