import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/shared/components/Text';
import { Button } from '@/src/shared/components/Button';
import { Input } from '@/src/shared/components/Input';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import { useAuth } from '@/src/modules/auth/hooks/useAuth';
import type { Branch } from '@/src/core/types';
import { useBranchStore } from '../store/branchStore';

interface Props {
  branch?: Branch | null;
  onDismiss: () => void;
  onRequestDelete?: (branch: Branch) => void;
}

export function BranchFormSheet({ branch, onDismiss, onRequestDelete }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { createBranch, updateBranch, reactivateBranch, loading, error, clearError } =
    useBranchStore();

  const [name, setName] = useState(branch?.name ?? '');

  useEffect(() => {
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit() {
    if (!user) return;
    if (branch) {
      await updateBranch(branch.id, { name });
    } else {
      await createBranch({ name }, user.tenantId);
    }
    if (!useBranchStore.getState().error) onDismiss();
  }

  async function handleReactivate() {
    if (!branch) return;
    await reactivateBranch(branch.id);
    if (!useBranchStore.getState().error) onDismiss();
  }

  const submitDisabled = !name.trim() || loading;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onDismiss}>
      <View className="flex-1 bg-white">
        <View className="items-center pt-3 pb-1">
          <View className="w-10 h-1 rounded-full bg-gray-300" />
        </View>
        <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
          <Text fontWeight="Bold" className="text-lg text-gray-900">
            {branch ? t('branches.edit_branch') : t('branches.add_branch')}
          </Text>
          <Pressable onPress={onDismiss}>
            <Text className="text-base text-primary font-medium">{t('common.cancel')}</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-6 pt-6" keyboardShouldPersistTaps="handled">
          {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

          {branch && !branch.active ? (
            <View className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
              <Text className="text-sm text-amber-800">
                {t('branches.inactive_branch_note')}
              </Text>
            </View>
          ) : null}

          <Input
            label={t('branches.name_label') + ' *'}
            value={name}
            onChangeText={setName}
            placeholder={t('branches.name_placeholder')}
            maxLength={60}
            onFocus={clearError}
          />

          <Button
            label={branch ? t('common.save_changes') : t('branches.add_branch')}
            onPress={handleSubmit}
            loading={loading}
            disabled={submitDisabled}
            fullWidth
          />

          {branch && branch.active && onRequestDelete ? (
            <Pressable
              onPress={() => onRequestDelete(branch)}
              className="border border-red-200 rounded-xl py-3.5 items-center mt-3"
            >
              <Text className="text-red-500 font-semibold">{t('common.delete')}</Text>
            </Pressable>
          ) : null}

          {branch && !branch.active ? (
            <Pressable
              onPress={handleReactivate}
              className="border border-indigo-200 rounded-xl py-3.5 items-center mt-3"
            >
              <Text className="text-primary font-semibold">
                {t('branches.reactivate')}
              </Text>
            </Pressable>
          ) : null}

          <View className="h-6" />
        </ScrollView>
      </View>
    </Modal>
  );
}
