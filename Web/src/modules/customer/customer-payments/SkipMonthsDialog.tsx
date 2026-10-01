import { useId, useState } from "react";
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
import Typography from "@mui/material/Typography";
import type { MonthEntry } from "@shared/core/types";
import { useSkipMonths } from "@shared/modules/customer/customer-payments/hooks/useSkipMonths";
import { skipText, type SkipMode } from "@shared/modules/customer/customer-payments/utils/skipText";
import { ErrorBanner } from "@/shared/components/ErrorBanner";

interface SkipMonthsDialogProps {
  entries: MonthEntry[];
  mode: SkipMode;
  customerId: string;
  lineId: string;
  onDone: () => void;
  onClose: () => void;
}

// Skipping takes an optional note; unskipping only confirms and shows it.
export function SkipMonthsDialog({ entries, mode, customerId, lineId, onDone, onClose }: SkipMonthsDialogProps) {
  const { t } = useTranslation();
  const skip = useSkipMonths(customerId, lineId);
  const [note, setNote] = useState("");
  const titleId = useId();
  const messageId = useId();
  const text = skipText(entries, mode, t);

  const close = () => {
    if (skip.saving) return;
    skip.clearError();
    onClose();
  };

  const confirm = async () => {
    if (skip.saving) return;
    if (await skip.submit(entries, mode, note.trim())) onDone();
  };

  return (
    <Dialog open onClose={close} maxWidth="xs" fullWidth aria-labelledby={titleId} aria-describedby={messageId}>
      <DialogTitle id={titleId} sx={{ fontWeight: 700 }}>
        {text.title}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <DialogContentText id={messageId}>{text.message}</DialogContentText>
          <ErrorBanner message={skip.error} onDismiss={skip.clearError} />
          {mode === "skip" ? (
            <TextField
              label={t("payments.skip.note_label")}
              placeholder={t("payments.skip.note_placeholder")}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              onFocus={skip.clearError}
              multiline
              minRows={2}
              fullWidth
              autoFocus
            />
          ) : text.existingNote ? (
            <Box sx={{ bgcolor: "background.default", border: 1, borderColor: "divider", borderRadius: 1, px: 1.5, py: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {t("payments.skip.note_label")}
              </Typography>
              <Typography variant="body2">{text.existingNote}</Typography>
            </Box>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close} disabled={skip.saving}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={() => void confirm()}
          disabled={skip.saving}
          startIcon={skip.saving ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {text.confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
