import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ConfirmDialog } from '@/src/shared/components/ConfirmDialog';
import { EmptyState } from '@/src/shared/components/EmptyState';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import type { SaasTier, Tenant } from '@/src/core/types';
import { SaasTierCard } from '../components/SaasTierCard';
import { SaasTierFormSheet } from '../components/SaasTierFormSheet';
import { useSaasTierStore } from '../store/saasTierStore';

interface Props {
  tenants: Tenant[];
}

export function SaasTierListScreen({ tenants }: Props) {
  const { saasTiers, loading, error, fetchSaasTiers, deleteSaasTier, clearError } = useSaasTierStore();
  const [formVisible, setFormVisible] = useState(false);
  const [editingTier, setEditingTier] = useState<SaasTier | null>(null);
  const [deletingTier, setDeletingTier] = useState<SaasTier | null>(null);

  useEffect(() => { fetchSaasTiers(); }, []);

  function openCreate() {
    setEditingTier(null);
    setFormVisible(true);
  }

  function openEdit(tier: SaasTier) {
    setEditingTier(tier);
    setFormVisible(true);
  }

  async function confirmDelete() {
    if (!deletingTier) return;
    await deleteSaasTier(deletingTier.id);
    setDeletingTier(null);
  }

  function getTenant(tenantId: string): Tenant | null {
    return tenants.find((t) => t.id === tenantId) ?? null;
  }

  const assignedTenantIds = new Set(saasTiers.map((t) => t.tenantId));
  const availableTenants = tenants.filter((t) => !assignedTenantIds.has(t.id));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>SaaS Tiers</Text>
        <Pressable onPress={openCreate} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <ErrorBanner message={error} onDismiss={clearError} />
        </View>
      ) : null}

      {loading && saasTiers.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#0a7ea4" size="large" />
        </View>
      ) : (
        <FlatList
          data={saasTiers}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <SaasTierCard
              tier={item}
              tenant={getTenant(item.tenantId)}
              onEdit={openEdit}
              onDelete={setDeletingTier}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              message="No SaaS tiers yet"
              subMessage="Tap + Add to configure a tier for a tenant"
            />
          }
        />
      )}

      <SaasTierFormSheet
        visible={formVisible}
        tier={editingTier}
        availableTenants={availableTenants}
        onDismiss={() => setFormVisible(false)}
      />

      <ConfirmDialog
        visible={!!deletingTier}
        title="Delete SaaS Tier"
        message={`Delete tier "${deletingTier?.name}"? The tenant will no longer have a tier configured.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeletingTier(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#1e293b' },
  addBtn: {
    backgroundColor: '#0a7ea4',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  errorContainer: { paddingHorizontal: 16, paddingTop: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, flexGrow: 1 },
});
