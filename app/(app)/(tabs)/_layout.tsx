import { Tabs } from 'expo-router';
import { useAuth } from '@/src/modules/auth/hooks/useAuth';

export default function TabsLayout() {
  const { isAdmin } = useAuth();

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
          title: 'Dashboard',
          href: isAdmin ? undefined : null,
          tabBarIcon: () => null,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Customers',
          tabBarIcon: () => null,
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: 'Plans',
          href: isAdmin ? undefined : null,
          tabBarIcon: () => null,
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: 'Staff',
          href: isAdmin ? undefined : null,
          tabBarIcon: () => null,
        }}
      />
    </Tabs>
  );
}
