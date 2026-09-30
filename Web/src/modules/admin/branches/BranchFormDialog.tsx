import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Alert from "@mui/material/Alert";
import TextField from "@mui/material/TextField";
import type { Branch } from "@shared/core/types";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useDirtyForm } from "@shared/shared/hooks/useDirtyForm";
import { useBranchSlice } from "@shared/state/hooks/useBranchSlice";
import { FormDialog } from "@/shared/components/FormDialog";

interface BranchFormDialogProps {
  branch: Branch | null;
  onClose: () => void;
  onSaved: (saved: Branch) => void;
}

export function BranchFormDialog({ branch, onClose, onSaved }: BranchFormDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const createBranch = useBranchSlice((s) => s.createBranch);
  const updateBranch = useBranchSlice((s) => s.updateBranch);
  const error = useBranchSlice((s) => s.error);
  const clearError = useBranchSlice((s) => s.clearError);
  const [name, setName] = useState(branch?.name ?? "");
  const dirty = useDirtyForm({ name });

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  const submit = async () => {
    if (!user) return;
    const saved = branch
      ? await updateBranch(branch.id, { name })
      : await createBranch({ name }, user.tenantId);
    if (saved) onSaved(saved);
  };

  return (
    <FormDialog
      open
      title={branch ? t("branches.edit_branch") : t("web.branches.add")}
      onClose={onClose}
      onSubmit={submit}
      dirty={dirty}
      error={error}
      onDismissError={clearError}
      submitLabel={branch ? t("common.save_changes") : t("web.branches.add")}
    >
      {branch && !branch.active ? (
        <Alert severity="warning">{t("branches.inactive_branch_note")}</Alert>
      ) : null}
      <TextField
        label={t("branches.name_label")}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          if (error) clearError();
        }}
        placeholder={t("branches.name_placeholder")}
        required
        autoFocus
        fullWidth
        slotProps={{ htmlInput: { maxLength: 60 } }}
      />
    </FormDialog>
  );
}
