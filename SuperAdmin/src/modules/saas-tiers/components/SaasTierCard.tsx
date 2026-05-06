import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SaasTier, Tenant } from '@/src/core/types';

interface SaasTierCardProps {
  tier: SaasTier;
  tenant: Tenant | null;
  onEdit: (tier: SaasTier) => void;
  onDelete: (tier: SaasTier) => void;
}

export function SaasTierCard({ tier, tenant, onEdit, onDelete }: SaasTierCardProps) {
  return (
    <View style={styles.card}>
      <Pressable style={styles.body} onPress={() => onEdit(tier)}>
        <View style={styles.header}>
          <Text style={styles.name}>{tier.name}</Text>
          <Text style={styles.price}>${tier.price.toFixed(2)}/mo</Text>
        </View>

        <Text style={styles.tenant} numberOfLines={1}>
          {tenant ? tenant.name : 'Unknown tenant'}
        </Text>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaValue}>{tier.maxUsers}</Text>
            <Text style={styles.metaLabel}>Users</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.metaItem}>
            <Text style={styles.metaValue}>{tier.maxCustomers}</Text>
            <Text style={styles.metaLabel}>Customers</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.metaItem}>
            <Text style={styles.metaValue}>{tier.graceDays}</Text>
            <Text style={styles.metaLabel}>Grace Days</Text>
          </View>
        </View>
      </Pressable>

      <Pressable onPress={() => onDelete(tier)} style={styles.deleteBtn} hitSlop={8}>
        <Text style={styles.deleteText}>Delete</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  body: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  name: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  price: { fontSize: 15, fontWeight: '700', color: '#0a7ea4' },
  tenant: { fontSize: 13, color: '#64748b', marginBottom: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  metaItem: { flex: 1, alignItems: 'center' },
  metaValue: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  metaLabel: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  divider: { width: 1, height: 28, backgroundColor: '#e2e8f0' },
  deleteBtn: { paddingHorizontal: 16, paddingVertical: 20 },
  deleteText: { fontSize: 13, color: '#ef4444', fontWeight: '500' },
});
