import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/src/modules/auth/hooks/useAuth';

export default function TabsLayout() {
  const { isAdmin } = useAuth();
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#ffffff', borderTopColor: '#e5e7eb' },
        tabBarActiveTintColor: '#6366f1',
        tabBarInactiveTintColor: '#6b7280',
        tabBarLabelStyle: { fontSize: 12, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('dashboard.title'),
          href: isAdmin ? undefined : null,
          tabBarIcon: () => null,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: t('customers.title'),
          tabBarIcon: () => null,
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: t('plans.title'),
          href: isAdmin ? undefined : null,
          tabBarIcon: () => null,
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: t('users.title'),
          href: isAdmin ? undefined : null,
          tabBarIcon: () => null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('settings.title'),
          tabBarIcon: () => null,
        }}
      />
    </Tabs>
  );
}
