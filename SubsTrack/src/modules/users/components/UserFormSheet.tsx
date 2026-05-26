import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { useTranslation } from "react-i18next";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import { BranchPicker } from "@/src/shared/components/BranchPicker";
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import type { AppUser } from "@/src/core/types";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import { useUserStore } from "../store/userStore";
import { useActiveBranches } from "../../branches/hooks/useActiveBranches";

interface Props {
  user?: AppUser | null;
  onDismiss: () => void;
}

type FormState = {
  username: string;
  fullName: string;
  password: string;
  confirmPassword: string;
  phoneNumber: string;
  role: "admin" | "user";
  branchId: string | null;
};

export function UserFormSheet({ user: editUser, onDismiss }: Props) {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const {
    createUser,
    updateUser,
    deactivateUser,
    activateUser,
    deleteUser,
    loading,
    error,
    clearError,
  } = useUserStore();
  const activeBranches = useActiveBranches();

  // For new users: branch-scoped admin → assign to their branch.
  // Tenant-wide admin → start unassigned and let them pick.
  //
  // Single-branch tenant (picker hidden): silently bind staff to the only
  // branch. The initial role on a new user is "user" (staff), so default to
  // that branch; the role-toggle handler below flips this to null when the
  // role is switched to admin.
  const defaultBranchId = (() => {
    if (editUser) return editUser.branchId;
    if (currentUser?.branchId) return currentUser.branchId;
    if (activeBranches.length === 1) return activeBranches[0].id;
    return null;
  })();

  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);

  const [form, setForm] = useState<FormState>({
    username: editUser?.username ?? "",
    fullName: editUser?.fullName ?? "",
    password: "",
    confirmPassword: "",
    phoneNumber: editUser?.phoneNumber ?? "",
    role: (editUser?.role as "admin" | "user") ?? "user",
    branchId: defaultBranchId,
  });

  const isOwnAccount = editUser?.id === currentUser?.id;

  const canToggleActive =
    !!editUser &&
    !!currentUser &&
    ((currentUser.role === "superadmin" && !isOwnAccount) ||
      (currentUser.role === "admin" && editUser.role === "user"));

  const canDelete = canToggleActive;

  async function handleDelete() {
    if (!editUser || !currentUser) return;
    const result = await deleteUser(
      editUser.id,
      currentUser.id,
      currentUser.role,
      editUser.role,
    );
    setDeleteConfirmVisible(false);
    if (result !== null) onDismiss();
  }

  const usernameInvalid =
    form.username.length > 0 && !/^[a-zA-Z0-9._]+$/.test(form.username);

  const passwordMismatch =
    !editUser &&
    form.password.length >= 8 &&
    form.confirmPassword.length > 0 &&
    form.password !== form.confirmPassword;

  useEffect(() => {
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Staff users must be assigned to a branch once the tenant has any.
  // BranchPicker hides itself when there are no branches, so this validation
  // only fires in the "we have branches AND staff role AND no branch picked" case.
  const branchMissingForStaff =
    activeBranches.length > 0 && form.role === "user" && !form.branchId;

  async function handleSubmit() {
    if (!currentUser) return;
    if (editUser) {
      await updateUser(editUser.id, currentUser.id, currentUser.role, {
        username: form.username,
        fullName: form.fullName,
        phone: form.phoneNumber || null,
        role: form.role,
        branchId: form.branchId,
      });
    } else {
      await createUser(
        {
          username: form.username,
          fullName: form.fullName,
          password: form.password,
          phone: form.phoneNumber || null,
          role: form.role,
          branchId: form.branchId,
        },
        currentUser.tenantId,
      );
    }
    if (!useUserStore.getState().error) onDismiss();
  }

  const canSubmit =
    !!form.username.trim() &&
    !!form.fullName.trim() &&
    !usernameInvalid &&
    !branchMissingForStaff &&
    (!!editUser ||
      (form.password.length >= 8 && form.password === form.confirmPassword));

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View className="flex-1 bg-white">
        {/* Drag handle */}
        <View className="items-center pt-3 pb-1">
          <View className="w-10 h-1 rounded-full bg-gray-300" />
        </View>

        <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
          <Text fontWeight="Bold" className="text-lg text-gray-900">
            {editUser ? t("users.edit_title") : t("users.add_title")}
          </Text>
          <Pressable onPress={onDismiss}>
            <Text className="text-base text-primary font-medium">
              {t("common.cancel")}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          className="flex-1 px-6 pt-6"
          keyboardShouldPersistTaps="handled"
        >
          {error ? (
            <ErrorBanner message={error} onDismiss={clearError} />
          ) : null}

          <Input
            label={t("users.username_label") + ' *'}
            value={form.username}
            onChangeText={(v) => setForm((prev) => ({ ...prev, username: v }))}
            placeholder={t("users.username_placeholder")}
            autoCapitalize="none"
            onFocus={clearError}
            error={
              usernameInvalid ? t("users.username_invalid_chars") : undefined
            }
          />

          <Input
            label={t("users.fullname_label") + ' *'}
            value={form.fullName}
            onChangeText={(v) => setForm((prev) => ({ ...prev, fullName: v }))}
            placeholder={t("users.fullname_placeholder")}
            autoCapitalize="words"
            onFocus={clearError}
          />

          {!editUser ? (
            <>
              <Input
                label={t("users.password_label") + ' *'}
                value={form.password}
                onChangeText={(v) =>
                  setForm((prev) => ({ ...prev, password: v }))
                }
                placeholder={t("users.password_placeholder")}
                secureTextEntry
                onFocus={clearError}
              />
              <Input
                label={t("users.confirm_password_label") + ' *'}
                value={form.confirmPassword}
                onChangeText={(v) =>
                  setForm((prev) => ({ ...prev, confirmPassword: v }))
                }
                placeholder={t("users.confirm_password_placeholder")}
                secureTextEntry
                onFocus={clearError}
                error={
                  passwordMismatch ? t("users.password_mismatch") : undefined
                }
              />
            </>
          ) : null}

          <Input
            label={t("users.phone_optional")}
            value={form.phoneNumber}
            onChangeText={(v) =>
              setForm((prev) => ({ ...prev, phoneNumber: v }))
            }
            placeholder={t("customers.phone_placeholder")}
            keyboardType="phone-pad"
          />

          <BranchPicker
            value={form.branchId}
            onChange={(v) => setForm((prev) => ({ ...prev, branchId: v }))}
            nullLabel={t("branches.tenant_wide_admin")}
            nullSublabel={t("branches.tenant_wide_hint")}
            nullable={form.role === "admin"}
          />

          <Text className="text-sm font-medium text-gray-700 mb-2">
            {t("users.role_label")}
          </Text>
          <View className="flex-row gap-3 mb-6">
            {(["user", "admin"] as const).map((r) => (
              <Pressable
                key={r}
                onPress={() =>
                  !isOwnAccount && setForm((prev) => ({ ...prev, role: r }))
                }
                className={`flex-1 border rounded-lg py-3 items-center ${
                  form.role === r
                    ? "border-primary bg-indigo-50"
                    : "border-gray-300"
                } ${isOwnAccount ? "opacity-40" : ""}`}
              >
                <Text
                  className={`font-medium capitalize ${form.role === r ? "text-primary" : "text-gray-600"}`}
                >
                  {t(`users.${r}`)}
                </Text>
              </Pressable>
            ))}
          </View>
          {isOwnAccount ? (
            <Text className="text-xs text-gray-400 mb-4 -mt-4">
              {t("common.cannot_change_own_role")}
            </Text>
          ) : null}

          <Button
            label={editUser ? t("common.save_changes") : t("users.add_title")}
            onPress={handleSubmit}
            loading={loading}
            disabled={!canSubmit}
            fullWidth
          />

          {canToggleActive && editUser ? (
            <Pressable
              onPress={async () => {
                if (!currentUser) return;
                if (editUser.active) {
                  await deactivateUser(
                    editUser.id,
                    currentUser.id,
                    currentUser.role,
                    editUser.role,
                  );
                } else {
                  await activateUser(
                    editUser.id,
                    currentUser.id,
                    currentUser.role,
                    editUser.role,
                  );
                }
                if (!useUserStore.getState().error) onDismiss();
              }}
              className={`mt-3 rounded-xl py-3.5 items-center mb-3 border ${
                editUser.active
                  ? "bg-red-50 border-red-200"
                  : "bg-green-50 border-green-200"
              }`}
            >
              <Text
                fontWeight="SemiBold"
                className={`text-base ${
                  editUser.active ? "text-red-600" : "text-green-700"
                }`}
              >
                {editUser.active ? t("users.deactivate") : t("users.activate")}
              </Text>
            </Pressable>
          ) : null}

          {canDelete && editUser ? (
            <Pressable
              onPress={() => setDeleteConfirmVisible(true)}
              className="rounded-xl py-3.5 items-center mb-6 border bg-red-50 border-red-200"
            >
              <Text fontWeight="SemiBold" className="text-base text-red-600">
                {t("users.delete_label")}
              </Text>
            </Pressable>
          ) : null}

          <View className="h-10" />
        </ScrollView>
      </View>

      <ConfirmDialog
        visible={deleteConfirmVisible}
        title={t("users.delete_title")}
        message={t("users.delete_message", { name: editUser?.fullName ?? "" })}
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirmVisible(false)}
      />
    </Modal>
  );
}
