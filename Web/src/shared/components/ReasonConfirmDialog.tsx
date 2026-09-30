import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { ErrorBanner } from "./ErrorBanner";

interface ReasonConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  checking?: boolean;
  error?: string | null;
  onDismissError?: () => void;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
  children?: ReactNode;
}

// A confirm that also takes an optional reason; `checking` holds the button back.
export function ReasonConfirmDialog({
  title,
  message,
  confirmLabel,
  destructive = false,
  checking = false,
  error = null,
  onDismissError,
  onConfirm,
  onClose,
  children,
}: ReasonConfirmDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const titleId = useId();
  const messageId = useId();

  const close = () => {
    if (!working) onClose();
  };

  const confirm = async () => {
    if (working || checking) return;
    setWorking(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog
      open
      onClose={(_event, closeReason) => {
        if (closeReason !== "backdropClick") close();
      }}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle id={titleId} sx={{ fontWeight: 700 }}>
        {title}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <DialogContentText id={messageId}>{message}</DialogContentText>
          {checking ? (
            <Box>
              <CircularProgress size={20} aria-label={t("web.loading")} />
            </Box>
          ) : null}
          {children}
          <ErrorBanner message={error} onDismiss={onDismissError} />
          <TextField
            label={t("web.void.reason")}
            value={reason}
            onChange={(event) => {
              onDismissError?.();
              setReason(event.target.value);
            }}
            multiline
            minRows={2}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close} disabled={working} autoFocus={destructive}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="contained"
          color={destructive ? "error" : "primary"}
          loading={working}
          disabled={checking}
          onClick={() => void confirm()}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
