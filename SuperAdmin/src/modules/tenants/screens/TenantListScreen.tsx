import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ConfirmDialog } from '@/src/shared/components/ConfirmDialog';
import { EmptyState } from '@/src/shared/components/EmptyState';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import type { SaasTier, Tenant } from '@/src/core/types';
import { TenantCard } from '../components/TenantCard';
import { TenantFormSheet } from '../components/TenantFormSheet';
import { useTenantStore } from '../store/tenantStore';

interface Props {
  saasTiers: SaasTier[];
}

export function TenantListScreen({ saasTiers }: Props) {
  const { tenants, loading, error, fetchTenants, deleteTenant, clearError } = useTenantStore();
  const [formVisible, setFormVisible] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [deletingTenant, setDeletingTenant] = useState<Tenant | null>(null);

  useEffect(() => { fetchTenants(); }, []);

  function openCreate() {
    setEditingTenant(null);
    setFormVisible(true);
  }

  function openEdit(tenant: Tenant) {
    setEditingTenant(tenant);
    setFormVisible(true);
  }

  async function confirmDelete() {
    if (!deletingTenant) return;
    await deleteTenant(deletingTenant.id);
    setDeletingTenant(null);
  }

  function getTierForTenant(tenantId: string): SaasTier | null {
    return saasTiers.find((t) => t.tenantId === tenantId) ?? null;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Tenants</Text>
        <Pressable onPress={openCreate} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <ErrorBanner message={error} onDismiss={clearError} />
        </View>
      ) : null}

      {loading && tenants.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#0a7ea4" size="large" />
        </View>
      ) : (
        <FlatList
          data={tenants}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TenantCard
              tenant={item}
              saasTier={getTierForTenant(item.id)}
              onEdit={openEdit}
              onDelete={setDeletingTenant}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              message="No tenants yet"
              subMessage="Tap + Add to create your first tenant"
            />
          }
        />
      )}

      <TenantFormSheet
        visible={formVisible}
        tenant={editingTenant}
        onDismiss={() => setFormVisible(false)}
      />

      <ConfirmDialog
        visible={!!deletingTenant}
        title="Delete Tenant"
        message={`Delete "${deletingTenant?.name}"? This will remove the tenant and all associated data.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeletingTenant(null)}
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
