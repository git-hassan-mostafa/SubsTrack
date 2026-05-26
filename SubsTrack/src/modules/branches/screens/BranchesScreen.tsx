import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { COLORS } from '@/src/shared/constants';
import { PageHeader } from '@/src/shared/components/PageHeader';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import { EmptyState } from '@/src/shared/components/EmptyState';
import { ConfirmDialog } from '@/src/shared/components/ConfirmDialog';
import {
  ActionMenu,
  type ActionMenuItem,
} from '@/src/shared/components/ActionMenu';
import type { Branch } from '@/src/core/types';
import { useBranchStore } from '../store/branchStore';
import { BranchCard } from '../components/BranchCard';
import { BranchFormSheet } from '../components/BranchFormSheet';

export function BranchesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    branches,
    loading,
    error,
    fetchBranches,
    deleteBranch,
    reactivateBranch,
    clearError,
  } = useBranchStore();

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [deleting, setDeleting] = useState<Branch | null>(null);
  const [deactivating, setDeactivating] = useState<Branch | null>(null);
  const [menuBranch, setMenuBranch] = useState<Branch | null>(null);

  useEffect(() => {
    fetchBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setEditing(null);
    setFormVisible(true);
  }

  function openEdit(branch: Branch) {
    setEditing(branch);
    setFormVisible(true);
  }

  async function confirmDelete() {
    if (!deleting) return;
    await deleteBranch(deleting.id);
    setDeleting(null);
  }

  async function confirmDeactivate() {
    if (!deactivating) return;
    await deleteBranch(deactivating.id);
    setDeactivating(null);
  }

  function buildMenuActions(branch: Branch | null): ActionMenuItem[] {
    if (!branch) return [];
    const items: ActionMenuItem[] = [
      {
        key: 'edit',
        label: t('common.edit'),
        icon: 'create-outline',
        onPress: () => openEdit(branch),
      },
    ];
    if (branch.active) {
      items.push({
        key: 'deactivate',
        label: t('branches.deactivate'),
        icon: 'pause-circle-outline',
        destructive: true,
        onPress: () => setDeactivating(branch),
      });
    } else {
      items.push({
        key: 'reactivate',
        label: t('branches.reactivate'),
        icon: 'play-circle-outline',
        onPress: () => reactivateBranch(branch.id),
      });
    }
    items.push({
      key: 'delete',
      label: t('common.delete'),
      icon: 'trash-outline',
      destructive: true,
      onPress: () => setDeleting(branch),
    });
    return items;
  }

  const activeCount = branches.filter((b) => b.active).length;

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        title={t('branches.section_title')}
        subtitle={t('branches.count', { count: activeCount })}
        showBack
        onBack={() => router.back()}
        actionLabel={t('branches.add_branch')}
        onAction={openCreate}
      />

      {error ? (
        <View className="px-4 pt-4">
          <ErrorBanner message={error} onDismiss={clearError} />
        </View>
      ) : null}

      {loading && branches.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={branches}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={fetchBranches}
              tintColor={COLORS.primary}
            />
          }
          renderItem={({ item }) => (
            <BranchCard branch={item} onEdit={openEdit} onMenu={setMenuBranch} />
          )}
          ListEmptyComponent={
            <EmptyState
              message={t('branches.no_branches')}
              subMessage={t('branches.no_branches_hint')}
              actionLabel={t('branches.add_branch')}
              onAction={openCreate}
            />
          }
        />
      )}

      {formVisible && (
        <BranchFormSheet
          branch={editing}
          onDismiss={() => {
            setFormVisible(false);
            setEditing(null);
          }}
          onRequestDelete={setDeleting}
        />
      )}

      <ActionMenu
        visible={menuBranch !== null}
        title={menuBranch?.name}
        actions={buildMenuActions(menuBranch)}
        onDismiss={() => setMenuBranch(null)}
      />

      <ConfirmDialog
        visible={!!deleting}
        title={t('branches.delete_title')}
        message={t('branches.delete_message', { name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />

      <ConfirmDialog
        visible={!!deactivating}
        title={t('branches.deactivate_title')}
        message={t('branches.deactivate_message', {
          name: deactivating?.name ?? '',
        })}
        destructive
        onConfirm={confirmDeactivate}
        onCancel={() => setDeactivating(null)}
      />
    </SafeAreaView>
  );
}
