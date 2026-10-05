import { useEffect, useState } from "react";
import { View } from "react-native";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { useTranslation } from "react-i18next";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import { BranchPicker } from "@/src/shared/components/BranchPicker";
import { confirm } from "@shared/shared/lib/confirm";
import type { AppUser } from "@shared/core/types";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useUserSlice } from "@shared/state/hooks/useUserSlice";
import { useActiveBranches } from "@shared/modules/admin/branches/hooks/useActiveBranches";
import { defaultNewBranchId } from "@shared/modules/admin/branches/utils/defaultBranch";
import { useBranchSlice } from "@shared/state/hooks/useBranchSlice";
import { useDirtyForm } from "@shared/shared/hooks/useDirtyForm";
import { canManageUser } from "@shared/modules/admin/users/utils/userPermissions";
import {
  mayBeTenantWide,
  roleLabelKey,
} from "@shared/modules/admin/users/utils/userRules";
import {
  canSaveUser,
  isPasswordMismatch,
  isRoleLocked,
  isUsernameInvalid,
  pickableRoles,
  seededStaffBranchId,
  userCreateInput,
  userDraftOf,
  userUpdateInput,
  withChangePassword,
} from "@shared/modules/admin/users/utils/userForm";

interface Props {
  user?: AppUser | null;
  onDismiss: () => void;
}

export function UserFormSheet({ user: editUser, onDismiss }: Props) {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const createUser = useUserSlice((s) => s.createUser);
  const updateUser = useUserSlice((s) => s.updateUser);
  const deactivateUser = useUserSlice((s) => s.deactivateUser);
  const activateUser = useUserSlice((s) => s.activateUser);
  const deleteUser = useUserSlice((s) => s.deleteUser);
  const loading = useUserSlice((s) => s.loading);
  const error = useUserSlice((s) => s.error);
  const clearError = useUserSlice((s) => s.clearError);
  const activeBranches = useActiveBranches();
  const branchesLoaded = useBranchSlice((s) => s.loaded);

  const editing = !!editUser;
  const [form, setForm] = useState(() =>
    userDraftOf(editUser ?? null, defaultNewBranchId(currentUser, activeBranches)),
  );

  const [branchAutoSeeded, setBranchAutoSeeded] = useState(false);
  const dirty = useDirtyForm(form, branchAutoSeeded ? ["branchId"] : undefined);

  const isOwnAccount = editing && editUser.id === currentUser?.id;
  const roleLocked = isRoleLocked(form, editUser ?? null, currentUser?.id);

  const canToggleActive =
    !!editUser && !!currentUser && canManageUser(currentUser, editUser);

  const canDelete = canToggleActive;

  async function handleDeletePress() {
    if (!editUser || !currentUser) return;
    let deleted = false;
    await confirm({
      title: t("users.delete_title"),
      message: t("users.delete_message", { name: editUser.fullName }),
      destructive: true,
      onConfirm: async () => {
        deleted =
          (await deleteUser(
            editUser.id,
            currentUser.id,
            currentUser.role,
            editUser.role,
          )) !== null;
      },
    });
    if (deleted) onDismiss();
  }

  const usernameInvalid = isUsernameInvalid(form);
  const passwordMismatch = isPasswordMismatch(form, editing);

  useEffect(() => {
    clearError();
  }, [clearError]);

  const seededBranchId = branchesLoaded
    ? seededStaffBranchId(form, editing, activeBranches)
    : null;

  useEffect(() => {
    if (seededBranchId === null) return;
    setBranchAutoSeeded(true);
    setForm((prev) => ({ ...prev, branchId: seededBranchId }));
  }, [seededBranchId]);

  async function handleSubmit() {
    if (!currentUser || !canSubmit) return;
    const saved = editUser
      ? await updateUser(
          editUser.id,
          currentUser.id,
          currentUser.role,
          userUpdateInput(form),
        )
      : await createUser(userCreateInput(form), currentUser.tenantId);
    if (saved) onDismiss();
  }

  const canSubmit =
    branchesLoaded && canSaveUser(form, editing, activeBranches.length);

  return (
    <FormSheet
      onDismiss={onDismiss}
      dirty={dirty}
      title={editUser ? t("users.edit_title") : t("users.add_title")}
    >
      {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

      <Input
        label={t("users.username_label") + " *"}
        value={form.username}
        onChangeText={(v) => setForm((prev) => ({ ...prev, username: v }))}
        placeholder={t("users.username_placeholder")}
        autoCapitalize="none"
        onFocus={clearError}
        error={usernameInvalid ? t("users.username_invalid_chars") : undefined}
      />

      <Input
        label={t("users.fullname_label") + " *"}
        value={form.fullName}
        onChangeText={(v) => setForm((prev) => ({ ...prev, fullName: v }))}
        placeholder={t("users.fullname_placeholder")}
        autoCapitalize="words"
        onFocus={clearError}
      />

      {!editUser ? (
        <>
          <Input
            label={t("users.password_label") + " *"}
            value={form.password}
            onChangeText={(v) => setForm((prev) => ({ ...prev, password: v }))}
            placeholder={t("users.password_placeholder")}
            secureTextEntry
            onFocus={clearError}
          />
          <Input
            label={t("users.confirm_password_label") + " *"}
            value={form.confirmPassword}
            onChangeText={(v) =>
              setForm((prev) => ({ ...prev, confirmPassword: v }))
            }
            placeholder={t("users.confirm_password_placeholder")}
            secureTextEntry
            onFocus={clearError}
            error={passwordMismatch ? t("users.password_mismatch") : undefined}
          />
        </>
      ) : (
        <>
          <PressableOpacity
            onPress={() =>
              setForm((prev) => withChangePassword(prev, !prev.changePassword))
            }
            className={`flex-row items-center justify-between border rounded-xl px-4 py-3.5 mb-4 ${
              form.changePassword
                ? "border-primary bg-indigo-50"
                : "border-gray-300 bg-white"
            }`}
          >
            <Text
              fontWeight="Medium"
              className={`text-sm ${form.changePassword ? "text-primary" : "text-gray-700"}`}
            >
              {t("users.change_password_label")}
            </Text>
            <View
              className={`w-5 h-5 rounded border-2 items-center justify-center ${
                form.changePassword
                  ? "bg-primary border-primary"
                  : "border-gray-400"
              }`}
            >
              {form.changePassword ? (
                <Text fontWeight="Bold" className="text-white text-xs">
                  ✓
                </Text>
              ) : null}
            </View>
          </PressableOpacity>

          {form.changePassword ? (
            <>
              <Input
                label={t("users.new_password_label") + " *"}
                value={form.password}
                onChangeText={(v) =>
                  setForm((prev) => ({ ...prev, password: v }))
                }
                placeholder={t("users.new_password_placeholder")}
                secureTextEntry
                onFocus={clearError}
              />
              <Input
                label={t("users.confirm_new_password_label") + " *"}
                value={form.confirmPassword}
                onChangeText={(v) =>
                  setForm((prev) => ({ ...prev, confirmPassword: v }))
                }
                placeholder={t("users.confirm_new_password_placeholder")}
                secureTextEntry
                onFocus={clearError}
                error={
                  passwordMismatch ? t("users.password_mismatch") : undefined
                }
              />
            </>
          ) : null}
        </>
      )}

      <Input
        label={t("users.phone_optional")}
        value={form.phoneNumber}
        onChangeText={(v) => setForm((prev) => ({ ...prev, phoneNumber: v }))}
        placeholder={t("customers.phone_placeholder")}
        keyboardType="phone-pad"
      />

      <BranchPicker
        value={form.branchId}
        onChange={(v) => {
          setBranchAutoSeeded(false);
          setForm((prev) => ({ ...prev, branchId: v }));
        }}
        nullLabel={t("branches.tenant_wide_admin")}
        nullSublabel={t("branches.tenant_wide_hint")}
        nullable={mayBeTenantWide(form.role)}
      />

      <Text fontWeight="Medium" className="text-sm text-gray-700 mb-2">
        {t("users.role_label")}
      </Text>
      <View className="flex-row gap-3 mb-6">
        {pickableRoles(form).map((r) => (
          <PressableOpacity
            key={r}
            onPress={() =>
              !roleLocked && setForm((prev) => ({ ...prev, role: r }))
            }
            className={`flex-1 border rounded-lg py-3 items-center ${
              form.role === r
                ? "border-primary bg-indigo-50"
                : "border-gray-300"
            } ${roleLocked ? "opacity-40" : ""}`}
          >
            <Text
              fontWeight="Medium"
              className={`capitalize ${form.role === r ? "text-primary" : "text-gray-600"}`}
            >
              {t(roleLabelKey(r))}
            </Text>
          </PressableOpacity>
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
        <PressableOpacity
          onPress={async () => {
            if (!currentUser) return;
            const toggle = editUser.active ? deactivateUser : activateUser;
            const saved = await toggle(
              editUser.id,
              currentUser.id,
              currentUser.role,
              editUser.role,
            );
            if (saved) onDismiss();
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
        </PressableOpacity>
      ) : null}

      {canDelete && editUser ? (
        <PressableOpacity
          onPress={() => void handleDeletePress()}
          className="rounded-xl py-3.5 items-center mb-6 border bg-red-50 border-red-200"
        >
          <Text fontWeight="SemiBold" className="text-base text-red-600">
            {t("users.delete_label")}
          </Text>
        </PressableOpacity>
      ) : null}

      <View className="h-24" />
    </FormSheet>
  );
}
