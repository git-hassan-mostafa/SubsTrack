import { useEffect, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '@/src/shared/components/Button';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import { Input } from '@/src/shared/components/Input';
import type { SaasTier, Tenant } from '@/src/core/types';
import { useSaasTierStore } from '../store/saasTierStore';

interface Props {
  visible: boolean;
  tier?: SaasTier | null;
  availableTenants: Tenant[];
  onDismiss: () => void;
}

export function SaasTierFormSheet({ visible, tier, availableTenants, onDismiss }: Props) {
  const { createSaasTier, updateSaasTier, loading, error, clearError } = useSaasTierStore();

  const isEditing = !!tier;

  const [name, setName] = useState('');
  const [maxUsers, setMaxUsers] = useState('');
  const [maxCustomers, setMaxCustomers] = useState('');
  const [price, setPrice] = useState('');
  const [graceDays, setGraceDays] = useState('0');
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [tenantPickerVisible, setTenantPickerVisible] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(tier?.name ?? '');
      setMaxUsers(tier ? String(tier.maxUsers) : '');
      setMaxCustomers(tier ? String(tier.maxCustomers) : '');
      setPrice(tier ? String(tier.price) : '');
      setGraceDays(tier ? String(tier.graceDays) : '0');
      setSelectedTenant(null);
      clearError();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, tier]);

  async function handleSubmit() {
    const data = {
      name,
      maxUsers: parseInt(maxUsers, 10),
      maxCustomers: parseInt(maxCustomers, 10),
      price: parseFloat(price),
      graceDays: parseInt(graceDays, 10),
    };

    let success: boolean;
    if (isEditing) {
      success = await updateSaasTier(tier.id, data);
    } else {
      success = await createSaasTier({ ...data, tenantId: selectedTenant!.id });
    }
    if (success) onDismiss();
  }

  const canSubmit = !!name.trim() && !!maxUsers && !!maxCustomers && !!price &&
    (isEditing || !!selectedTenant);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{isEditing ? 'Edit SaaS Tier' : 'Add SaaS Tier'}</Text>
          <Pressable onPress={onDismiss}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
          {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

          {!isEditing ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Tenant</Text>
              <Pressable
                style={[styles.picker, !selectedTenant && styles.pickerEmpty]}
                onPress={() => setTenantPickerVisible(true)}
              >
                <Text style={selectedTenant ? styles.pickerText : styles.pickerPlaceholder}>
                  {selectedTenant ? selectedTenant.name : 'Select a tenant...'}
                </Text>
                <Text style={styles.pickerChevron}>›</Text>
              </Pressable>
              {availableTenants.length === 0 ? (
                <Text style={styles.hint}>All tenants already have a tier assigned</Text>
              ) : null}
            </View>
          ) : null}

          <Input
            label="Tier Name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Basic, Pro, Enterprise"
            onFocus={clearError}
          />

          <View style={styles.row}>
            <View style={styles.half}>
              <Input
                label="Max Users"
                value={maxUsers}
                onChangeText={setMaxUsers}
                placeholder="10"
                keyboardType="number-pad"
                onFocus={clearError}
              />
            </View>
            <View style={styles.spacer} />
            <View style={styles.half}>
              <Input
                label="Max Customers"
                value={maxCustomers}
                onChangeText={setMaxCustomers}
                placeholder="500"
                keyboardType="number-pad"
                onFocus={clearError}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.half}>
              <Input
                label="Price ($/mo)"
                value={price}
                onChangeText={setPrice}
                placeholder="29.99"
                keyboardType="decimal-pad"
                onFocus={clearError}
              />
            </View>
            <View style={styles.spacer} />
            <View style={styles.half}>
              <Input
                label="Grace Days"
                value={graceDays}
                onChangeText={setGraceDays}
                placeholder="0"
                keyboardType="number-pad"
                onFocus={clearError}
              />
            </View>
          </View>

          <View style={styles.submitRow}>
            <Button
              label={isEditing ? 'Save Changes' : 'Create Tier'}
              onPress={handleSubmit}
              loading={loading}
              disabled={!canSubmit}
              fullWidth
            />
          </View>
        </ScrollView>
      </View>

      {/* Tenant picker modal */}
      <Modal
        visible={tenantPickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setTenantPickerVisible(false)}
      >
        <View style={styles.pickerModal}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Select Tenant</Text>
            <Pressable onPress={() => setTenantPickerVisible(false)}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
          </View>
          <FlatList
            data={availableTenants}
            keyExtractor={(t) => t.id}
            renderItem={({ item }) => (
              <Pressable
                style={styles.tenantRow}
                onPress={() => {
                  setSelectedTenant(item);
                  setTenantPickerVisible(false);
                }}
              >
                <Text style={styles.tenantRowName}>{item.name}</Text>
                {selectedTenant?.id === item.id ? (
                  <Text style={styles.check}>✓</Text>
                ) : null}
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.emptyPicker}>
                <Text style={styles.emptyPickerText}>No tenants available</Text>
              </View>
            }
          />
        </View>
      </Modal>
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
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 4 },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  pickerEmpty: { borderColor: '#d1d5db' },
  pickerText: { fontSize: 16, color: '#111827' },
  pickerPlaceholder: { fontSize: 16, color: '#9ca3af' },
  pickerChevron: { fontSize: 20, color: '#94a3b8' },
  hint: { fontSize: 12, color: '#f59e0b', marginTop: 4 },
  row: { flexDirection: 'row' },
  half: { flex: 1 },
  spacer: { width: 12 },
  submitRow: { marginTop: 8, marginBottom: 32 },
  pickerModal: { flex: 1, backgroundColor: '#fff' },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  pickerTitle: { fontSize: 18, fontWeight: '600', color: '#1e293b' },
  tenantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  tenantRowName: { flex: 1, fontSize: 16, color: '#1e293b' },
  check: { fontSize: 18, color: '#0a7ea4', fontWeight: '600' },
  emptyPicker: { padding: 32, alignItems: 'center' },
  emptyPickerText: { fontSize: 15, color: '#94a3b8' },
});
