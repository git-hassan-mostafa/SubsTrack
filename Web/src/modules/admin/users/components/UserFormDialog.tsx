import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import type { AppUser, UserRole } from "@shared/core/types";
import { useActiveBranches } from "@shared/modules/admin/branches/hooks/useActiveBranches";
import { defaultNewBranchId } from "@shared/modules/admin/branches/utils/defaultBranch";
import {
  asksPassword,
  canSaveUser,
  isPasswordMismatch,
  isRoleLocked,
  isUsernameInvalid,
  pickableRoles,
  userCreateInput,
  userDraftOf,
  userUpdateInput,
  withChangePassword,
  type UserDraft,
} from "@shared/modules/admin/users/utils/userForm";
import { mayBeTenantWide, roleLabelKey } from "@shared/modules/admin/users/utils/userRules";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useDirtyForm } from "@shared/shared/hooks/useDirtyForm";
import { useUserSlice } from "@shared/state/hooks/useUserSlice";
import { BranchPicker } from "@/shared/components/BranchPicker";
import { FormDialog } from "@/shared/components/FormDialog";

interface UserFormDialogProps {
  user: AppUser | null;
  onClose: () => void;
  onSaved: (saved: AppUser) => void;
}

// Accounts are created and re-passworded by edge functions, so this is online-only.
export function UserFormDialog({ user: editUser, onClose, onSaved }: UserFormDialogProps) {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const createUser = useUserSlice((s) => s.createUser);
  const updateUser = useUserSlice((s) => s.updateUser);
  const error = useUserSlice((s) => s.error);
  const clearError = useUserSlice((s) => s.clearError);
  const activeBranches = useActiveBranches();
  const [form, setForm] = useState(() =>
    userDraftOf(editUser, defaultNewBranchId(currentUser, activeBranches)),
  );
  const dirty = useDirtyForm(form);
  const editing = editUser !== null;
  const isOwnAccount = editing && editUser.id === currentUser?.id;
  const askPassword = asksPassword(form, editing);
  const usernameInvalid = isUsernameInvalid(form);
  const mismatch = isPasswordMismatch(form, editing);
  const canSave = canSaveUser(form, editing, activeBranches.length);

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  const change = (patch: Partial<UserDraft>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    if (error) clearError();
  };

  const submit = async () => {
    if (!currentUser || !canSave) return;
    const saved = editUser
      ? await updateUser(editUser.id, currentUser.id, currentUser.role, userUpdateInput(form))
      : await createUser(userCreateInput(form), currentUser.tenantId);
    if (saved) onSaved(saved);
  };

  return (
    <FormDialog
      open
      title={editUser ? t("users.edit_title") : t("web.users.add")}
      onClose={onClose}
      onSubmit={submit}
      dirty={dirty}
      error={error}
      onDismissError={clearError}
      submitLabel={editUser ? t("common.save_changes") : t("web.users.add")}
      submitDisabled={!canSave}
    >
      <TextField
        label={t("users.username_label")}
        value={form.username}
        onChange={(event) => change({ username: event.target.value })}
        placeholder={t("users.username_placeholder")}
        error={usernameInvalid}
        helperText={usernameInvalid ? t("users.username_invalid_chars") : undefined}
        required
        autoFocus
        fullWidth
        slotProps={{ htmlInput: { autoCapitalize: "none", autoComplete: "off" } }}
      />
      <TextField
        label={t("users.fullname_label")}
        value={form.fullName}
        onChange={(event) => change({ fullName: event.target.value })}
        placeholder={t("users.fullname_placeholder")}
        required
        fullWidth
      />
      {editUser ? (
        <FormControlLabel
          control={
            <Checkbox
              checked={form.changePassword}
              onChange={(event) => {
                setForm((prev) => withChangePassword(prev, event.target.checked));
                if (error) clearError();
              }}
            />
          }
          label={t("users.change_password_label")}
        />
      ) : null}
      {askPassword ? (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            type="password"
            label={t(editUser ? "users.new_password_label" : "users.password_label")}
            value={form.password}
            onChange={(event) => change({ password: event.target.value })}
            placeholder={t("users.password_placeholder")}
            required
            fullWidth
            slotProps={{ htmlInput: { autoComplete: "new-password" } }}
          />
          <TextField
            type="password"
            label={t(
              editUser ? "users.confirm_new_password_label" : "users.confirm_password_label",
            )}
            value={form.confirmPassword}
            onChange={(event) => change({ confirmPassword: event.target.value })}
            placeholder={t("users.confirm_password_placeholder")}
            error={mismatch}
            helperText={mismatch ? t("users.password_mismatch") : undefined}
            required
            fullWidth
            slotProps={{ htmlInput: { autoComplete: "new-password" } }}
          />
        </Stack>
      ) : null}
      <TextField
        label={t("users.phone_optional")}
        value={form.phoneNumber}
        onChange={(event) => change({ phoneNumber: event.target.value })}
        placeholder={t("customers.phone_placeholder")}
        fullWidth
        slotProps={{ htmlInput: { inputMode: "tel" } }}
      />
      <Stack spacing={1}>
        <FormLabel id="user-role-label">{t("users.role_label")}</FormLabel>
        <ToggleButtonGroup
          exclusive
          color="primary"
          value={form.role}
          onChange={(_event, role: UserRole | null) => {
            if (role) change({ role });
          }}
          disabled={isRoleLocked(form, editUser, currentUser?.id)}
          aria-labelledby="user-role-label"
        >
          {pickableRoles(form).map((role) => (
            <ToggleButton key={role} value={role} sx={{ px: 3 }}>
              {t(roleLabelKey(role))}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {isOwnAccount ? <FormHelperText>{t("common.cannot_change_own_role")}</FormHelperText> : null}
      </Stack>
      <BranchPicker
        value={form.branchId}
        onChange={(branchId) => change({ branchId })}
        nullable={mayBeTenantWide(form.role)}
        nullLabel={t("branches.tenant_wide_admin")}
      />
    </FormDialog>
  );
}
