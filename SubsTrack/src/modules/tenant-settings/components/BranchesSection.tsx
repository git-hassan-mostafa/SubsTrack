import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/shared/components/Text';
import { Button } from '@/src/shared/components/Button';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import { EmptyState } from '@/src/shared/components/EmptyState';
import { ConfirmDialog } from '@/src/shared/components/ConfirmDialog';
import { COLORS } from '@/src/shared/constants';
import type { Branch } from '@/src/core/types';
import { useBranchStore } from '@/src/modules/branches/store/branchStore';
import { BranchCard } from '@/src/modules/branches/components/BranchCard';
import { BranchFormSheet } from '@/src/modules/branches/components/BranchFormSheet';

export function BranchesSection() {
  const { t } = useTranslation();
  const { branches, loading, error, fetchBranches, deleteBranch, clearError } =
    useBranchStore();

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [deleting, setDeleting] = useState<Branch | null>(null);

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
    setFormVisible(false);
    setDeleting(null);
  }

  return (
    <>
      {error ? (
        <View className="mb-4">
          <ErrorBanner message={error} onDismiss={clearError} />
        </View>
      ) : null}

      <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-1">
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {t('branches.section_title')}
            </Text>
            <Text className="text-xs text-gray-500 mt-0.5">
              {t('branches.section_hint')}
            </Text>
          </View>
          <Button
            label={t('branches.add_branch')}
            onPress={openCreate}
            variant="primary"
          />
        </View>

        {loading && branches.length === 0 ? (
          <View className="items-center py-6">
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : branches.length === 0 ? (
          <EmptyState
            message={t('branches.no_branches')}
            subMessage={t('branches.no_branches_hint')}
          />
        ) : (
          branches.map((b) => (
            <BranchCard key={b.id} branch={b} onEdit={openEdit} />
          ))
        )}
      </View>

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

      <ConfirmDialog
        visible={!!deleting}
        title={t('branches.delete_title')}
        message={t('branches.delete_message', { name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
