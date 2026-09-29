import { useId, useState, type SyntheticEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog, { type DialogProps } from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import CloseIcon from "@mui/icons-material/Close";
import { useUnsavedChangesGuard } from "@shared/shared/hooks/useUnsavedChangesGuard";
import { ErrorBanner } from "./ErrorBanner";

interface FormDialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
  dirty?: boolean;
  error?: string | null;
  onDismissError?: () => void;
  submitLabel?: string;
  maxWidth?: DialogProps["maxWidth"];
  children: ReactNode;
}

// Every close asks to discard when dirty; a backdrop click never closes it.
export function FormDialog({
  open,
  title,
  onClose,
  onSubmit,
  dirty = false,
  error = null,
  onDismissError,
  submitLabel,
  maxWidth = "sm",
  children,
}: FormDialogProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [guardedClose] = useUnsavedChangesGuard(dirty, onClose);
  const titleId = useId();

  const close = () => {
    if (!saving) guardedClose();
  };

  const handleSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    const stopSaving = () => setSaving(false);
    void Promise.resolve(onSubmit()).then(stopSaving, stopSaving);
  };

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => {
        if (reason !== "backdropClick") close();
      }}
      aria-labelledby={titleId}
      maxWidth={maxWidth}
      fullWidth
    >
      <DialogTitle id={titleId} sx={{ fontWeight: 700, paddingInlineEnd: 7 }}>
        {title}
      </DialogTitle>
      <IconButton
        aria-label={t("common.close")}
        onClick={close}
        disabled={saving}
        sx={{ position: "absolute", insetInlineEnd: 12, top: 12 }}
      >
        <CloseIcon />
      </IconButton>
      <Box
        component="form"
        noValidate
        onSubmit={handleSubmit}
        sx={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 }}
      >
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <ErrorBanner message={error} onDismiss={onDismissError} />
            {children}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={close} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="contained" loading={saving}>
            {submitLabel ?? t("common.save")}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
