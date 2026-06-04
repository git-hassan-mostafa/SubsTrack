import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { COLORS } from '@/src/shared/constants';
import { PageHeader } from '@/src/shared/components/PageHeader';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import { EmptyState } from '@/src/shared/components/EmptyState';
import { confirm } from '@/src/shared/lib/confirm';
import {
  ActionMenu,
  type ActionMenuItem,
} from '@/src/shared/components/ActionMenu';
import type { Branch } from '@/src/core/types';
import { useBranchSlice } from '@/src/state/hooks/useBranchSlice';
import { BranchCard } from '../components/BranchCard';
import { BranchFormSheet } from '../components/BranchFormSheet';

export function BranchesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const branches = useBranchSlice((s) => s.items);
  const loading = useBranchSlice((s) => s.loading);
  const error = useBranchSlice((s) => s.error);
  const fetchBranches = useBranchSlice((s) => s.fetchBranches);
  const deleteBranch = useBranchSlice((s) => s.deleteBranch);
  const reactivateBranch = useBranchSlice((s) => s.reactivateBranch);
  const clearError = useBranchSlice((s) => s.clearError);

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
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

  async function handleDeactivateBranch(branch: Branch) {
    const ok = await confirm({
      title: t('branches.deactivate_title'),
      message: t('branches.deactivate_message', { name: branch.name }),
      destructive: true,
    });
    if (!ok) return;
    await deleteBranch(branch.id);
  }

  async function handleDeleteBranch(branch: Branch) {
    const ok = await confirm({
      title: t('branches.delete_title'),
      message: t('branches.delete_message', { name: branch.name }),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (!ok) return;
    await deleteBranch(branch.id);
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
        onPress: () => void handleDeactivateBranch(branch),
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
      onPress: () => void handleDeleteBranch(branch),
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
          onRequestDelete={(branch) => void handleDeleteBranch(branch)}
        />
      )}

      <ActionMenu
        visible={menuBranch !== null}
        title={menuBranch?.name}
        actions={buildMenuActions(menuBranch)}
        onDismiss={() => setMenuBranch(null)}
      />
    </SafeAreaView>
  );
}
