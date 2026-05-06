import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Button } from '@/src/shared/components/Button';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import { Input } from '@/src/shared/components/Input';
import type { Tenant } from '@/src/core/types';
import { useTenantStore } from '../store/tenantStore';

interface Props {
  visible: boolean;
  tenant?: Tenant | null;
  onDismiss: () => void;
}

export function TenantFormSheet({ visible, tenant, onDismiss }: Props) {
  const { createTenant, updateTenant, loading, error, clearError } = useTenantStore();

  const isEditing = !!tenant;

  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  useEffect(() => {
    if (visible) {
      setName(tenant?.name ?? '');
      setActive(tenant?.active ?? true);
      setAdminEmail('');
      setAdminPassword('');
      clearError();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, tenant]);

  async function handleSubmit() {
    let success: boolean;
    if (isEditing) {
      success = await updateTenant(tenant.id, { name, active });
    } else {
      success = await createTenant({ name, adminEmail, adminPassword });
    }
    if (success) onDismiss();
  }

  const canSubmit = isEditing
    ? !!name.trim()
    : !!name.trim() && !!adminEmail.trim() && adminPassword.length >= 8;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{isEditing ? 'Edit Tenant' : 'Add Tenant'}</Text>
          <Pressable onPress={onDismiss}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
          {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

          <Input
            label="Tenant Name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Acme ISP"
            onFocus={clearError}
          />

          {isEditing ? (
            <View style={styles.switchRow}>
              <View>
                <Text style={styles.switchLabel}>Active</Text>
                <Text style={styles.switchHint}>Inactive tenants cannot log in</Text>
              </View>
              <Switch
                value={active}
                onValueChange={setActive}
                trackColor={{ true: '#0a7ea4' }}
              />
            </View>
          ) : (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Admin User</Text>
                <Text style={styles.sectionHint}>
                  An admin account will be created for this tenant
                </Text>
              </View>

              <Input
                label="Admin Email"
                value={adminEmail}
                onChangeText={setAdminEmail}
                placeholder="admin@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                onFocus={clearError}
              />

              <Input
                label="Admin Password"
                value={adminPassword}
                onChangeText={setAdminPassword}
                placeholder="Min. 8 characters"
                secureTextEntry
                onFocus={clearError}
              />

              {adminPassword.length > 0 && adminPassword.length < 8 ? (
                <Text style={styles.hint}>Password must be at least 8 characters</Text>
              ) : null}
            </>
          )}

          <View style={styles.submitRow}>
            <Button
              label={isEditing ? 'Save Changes' : 'Create Tenant'}
              onPress={handleSubmit}
              loading={loading}
              disabled={!canSubmit}
              fullWidth
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  title: { fontSize: 18, fontWeight: '600', color: '#1e293b' },
  cancel: { fontSize: 16, color: '#0a7ea4', fontWeight: '500' },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 16,
  },
  switchLabel: { fontSize: 14, fontWeight: '500', color: '#374151' },
  switchHint: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  sectionHeader: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 4 },
  sectionHint: { fontSize: 13, color: '#64748b' },
  hint: { fontSize: 13, color: '#f59e0b', marginTop: -8, marginBottom: 12 },
  submitRow: { marginTop: 8, marginBottom: 32 },
});
