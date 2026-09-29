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
import type { StaffRole } from "@shared/modules/admin/users/utils/types";
import { isValidUsername } from "@shared/modules/admin/users/utils/userRules";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useDirtyForm } from "@shared/shared/hooks/useDirtyForm";
import { useUserSlice } from "@shared/state/hooks/useUserSlice";
import { BranchPicker } from "@/shared/components/BranchPicker";
import { FormDialog } from "@/shared/components/FormDialog";

interface UserFormDialogProps {
  user: AppUser | null;
  onClose: () => void;
  onSaved: () => void;
}

type UserForm = {
  username: string;
  fullName: string;
  password: string;
  confirmPassword: string;
  phoneNumber: string;
  role: UserRole;
  branchId: string | null;
  changePassword: boolean;
};

const STAFF_ROLES: readonly StaffRole[] = ["user", "admin"];
const ROLE_LABEL_KEYS: Record<UserRole, string> = {
  user: "users.user",
  admin: "users.admin",
  superadmin: "users.super",
};

// Accounts are created and re-passworded by edge functions, so this is online-only.
export function UserFormDialog({ user: editUser, onClose, onSaved }: UserFormDialogProps) {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const createUser = useUserSlice((s) => s.createUser);
  const updateUser = useUserSlice((s) => s.updateUser);
  const error = useUserSlice((s) => s.error);
  const clearError = useUserSlice((s) => s.clearError);
  const activeBranches = useActiveBranches();
  const [mismatch, setMismatch] = useState(false);
  const [form, setForm] = useState<UserForm>({
    username: editUser?.username ?? "",
    fullName: editUser?.fullName ?? "",
    password: "",
    confirmPassword: "",
    phoneNumber: editUser?.phoneNumber ?? "",
    role: editUser?.role ?? "user",
    branchId: editUser ? editUser.branchId : defaultNewBranchId(currentUser, activeBranches),
    changePassword: false,
  });
  const dirty = useDirtyForm(form);
  const isOwnAccount = !!editUser && editUser.id === currentUser?.id;
  const isOwner = form.role === "superadmin";
  const roles: readonly UserRole[] = isOwner ? ["superadmin"] : STAFF_ROLES;
  const askPassword = !editUser || form.changePassword;
  const usernameInvalid = form.username.length > 0 && !isValidUsername(form.username);

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  const change = (patch: Partial<UserForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setMismatch(false);
    if (error) clearError();
  };

  const submit = async () => {
    if (!currentUser) return;
    if (askPassword && form.password !== form.confirmPassword) {
      setMismatch(true);
      return;
    }
    const details = {
      username: form.username,
      fullName: form.fullName,
      phone: form.phoneNumber || null,
      branchId: form.branchId,
    };
    const saved = editUser
      ? await updateUser(editUser.id, currentUser.id, currentUser.role, {
          ...details,
          role: form.role,
          newPassword: form.changePassword ? form.password : undefined,
        })
      : await createUser(
          { ...details, role: form.role === "user" ? "user" : "admin", password: form.password },
          currentUser.tenantId,
        );
    if (saved) onSaved();
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
              onChange={(event) =>
                change({ changePassword: event.target.checked, password: "", confirmPassword: "" })
              }
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
          disabled={isOwnAccount || isOwner}
          aria-labelledby="user-role-label"
        >
          {roles.map((role) => (
            <ToggleButton key={role} value={role} sx={{ px: 3 }}>
              {t(ROLE_LABEL_KEYS[role])}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {isOwnAccount ? <FormHelperText>{t("common.cannot_change_own_role")}</FormHelperText> : null}
      </Stack>
      <BranchPicker
        value={form.branchId}
        onChange={(branchId) => change({ branchId })}
        nullable={form.role !== "user"}
        nullLabel={t("branches.tenant_wide_admin")}
      />
    </FormDialog>
  );
}
