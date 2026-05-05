import { Ionicons } from '@expo/vector-icons';
import { Href, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type MenuItem = {
  labelKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
};

const MENU_ITEMS: MenuItem[] = [
  { labelKey: 'dashboard.title', icon: 'bar-chart-outline', route: '/(app)/(tabs)/admin/dashboard' },
  { labelKey: 'users.title', icon: 'people-outline', route: '/(app)/(tabs)/admin/users' },
  { labelKey: 'plans.title', icon: 'pricetag-outline', route: '/(app)/(tabs)/admin/plans' },
];

export default function AdminMenuScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{t('admin.title')}</Text>
      <View style={styles.list}>
        {MENU_ITEMS.map((item, index) => (
          <TouchableOpacity
            key={item.route}
            style={[styles.item, index < MENU_ITEMS.length - 1 && styles.itemBorder]}
            onPress={() => router.push(item.route as Href)}
            activeOpacity={0.6}
          >
            <View style={styles.itemLeft}>
              <View style={styles.iconWrapper}>
                <Ionicons name={item.icon} size={20} color="#6366f1" />
              </View>
              <Text style={styles.itemLabel}>{t(item.labelKey)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  header: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 24,
  },
  list: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  itemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
});
