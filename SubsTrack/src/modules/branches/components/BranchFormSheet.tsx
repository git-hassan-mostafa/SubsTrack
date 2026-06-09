import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { Input } from "@/src/shared/components/Input";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import type { Branch } from "@/src/core/types";
import { useBranchSlice } from "@/src/state/hooks/useBranchSlice";
import { getStore } from "@/src/state/globalStore";
import { useSubscriptionSlice } from "@/src/state/hooks/useSubscriptionSlice";
import { UpgradePromptModal } from "@/src/modules/subscription/components/UpgradePromptModal";

interface Props {
  branch?: Branch | null;
  onDismiss: () => void;
  onRequestDelete?: (branch: Branch) => void;
}

export function BranchFormSheet({ branch, onDismiss, onRequestDelete }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const createBranch = useBranchSlice((s) => s.createBranch);
  const updateBranch = useBranchSlice((s) => s.updateBranch);
  const reactivateBranch = useBranchSlice((s) => s.reactivateBranch);
  const loading = useBranchSlice((s) => s.loading);
  const error = useBranchSlice((s) => s.error);
  const clearError = useBranchSlice((s) => s.clearError);
  const tierLimitError = useBranchSlice((s) => s.tierLimitError);
  const clearTierLimitError = useBranchSlice((s) => s.clearTierLimitError);
  const currentTier = useSubscriptionSlice((s) => s.currentTier);
  const usage = useSubscriptionSlice((s) => s.usage);

  const [name, setName] = useState(branch?.name ?? "");

  useEffect(() => {
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit() {
    if (!user) return;
    if (branch) {
      await updateBranch(branch.id, { name });
    } else {
      if (!currentTier) return;
      await createBranch({ name }, user.tenantId, currentTier, usage);
    }
    const { error: nextError, tierLimitError: nextTierLimit } =
      getStore().getState().branches;
    if (!nextError && !nextTierLimit) onDismiss();
  }

  async function handleReactivate() {
    if (!branch) return;
    await reactivateBranch(branch.id);
    if (!getStore().getState().branches.error) onDismiss();
  }

  const submitDisabled = !name.trim() || loading;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <SafeAreaView className="flex-1 bg-white">
        <View className="items-center pt-3 pb-1">
          <View className="w-10 h-1 rounded-full bg-gray-300" />
        </View>
        <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
          <Text fontWeight="Bold" className="text-lg text-gray-900">
            {branch ? t("branches.edit_branch") : t("branches.add_branch")}
          </Text>
          <PressableOpacity onPress={onDismiss}>
            <Text className="text-base text-primary font-medium">
              {t("common.cancel")}
            </Text>
          </PressableOpacity>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
        <ScrollView
          className="flex-1 px-6 pt-6"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 48 }}
        >
          {error ? (
            <ErrorBanner message={error} onDismiss={clearError} />
          ) : null}

          {branch && !branch.active ? (
            <View className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
              <Text className="text-sm text-amber-800">
                {t("branches.inactive_branch_note")}
              </Text>
            </View>
          ) : null}

          <Input
            label={t("branches.name_label") + " *"}
            value={name}
            onChangeText={setName}
            placeholder={t("branches.name_placeholder")}
            maxLength={60}
            onFocus={clearError}
          />

          <Button
            label={branch ? t("common.save_changes") : t("branches.add_branch")}
            onPress={handleSubmit}
            loading={loading}
            disabled={submitDisabled}
            fullWidth
          />

          {branch && branch.active && onRequestDelete ? (
            <PressableOpacity
              onPress={() => onRequestDelete(branch)}
              className="border border-red-200 rounded-xl py-3.5 items-center mt-3"
            >
              <Text className="text-red-500 font-semibold">
                {t("common.delete")}
              </Text>
            </PressableOpacity>
          ) : null}

          {branch && !branch.active ? (
            <PressableOpacity
              onPress={handleReactivate}
              className="border border-indigo-200 rounded-xl py-3.5 items-center mt-3"
            >
              <Text className="text-primary font-semibold">
                {t("branches.reactivate")}
              </Text>
            </PressableOpacity>
          ) : null}

          <View className="h-6" />
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <UpgradePromptModal
        payload={tierLimitError}
        onClose={() => {
          clearTierLimitError();
          onDismiss();
        }}
      />
    </Modal>
  );
}
