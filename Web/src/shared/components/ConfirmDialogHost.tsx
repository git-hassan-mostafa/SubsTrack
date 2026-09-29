import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { reportException } from "@shared/core/runtime/reportException";
import { useConfirmStore } from "@shared/shared/lib/confirmStore";

async function runQuietly(work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    reportException({
      source: "global_handler",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context: "confirm onConfirm",
    });
  }
}

// Mounted once for the whole app; answers every Shared confirm() call.
export function ConfirmDialogHost() {
  const { t } = useTranslation();
  const visible = useConfirmStore((s) => s.visible);
  const options = useConfirmStore((s) => s.options);
  const settle = useConfirmStore((s) => s.settle);
  const getContent = useConfirmStore((s) => s.getContent);
  const getOnConfirm = useConfirmStore((s) => s.getOnConfirm);
  const [working, setWorking] = useState(false);
  const titleId = useId();
  const messageId = useId();

  if (!options) return null;

  const content = getContent();
  const work = getOnConfirm();

  const handleConfirm = async () => {
    if (!work) {
      settle(true);
      return;
    }
    setWorking(true);
    await runQuietly(work);
    setWorking(false);
    settle(true);
  };

  const cancel = () => {
    if (!working) settle(false);
  };

  return (
    <Dialog
      open={visible}
      onClose={cancel}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle id={titleId} sx={{ fontWeight: 700 }}>
        {options.title}
      </DialogTitle>
      <DialogContent>
        <DialogContentText id={messageId}>{options.message}</DialogContentText>
        {content ? content() : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {options.hideCancel ? null : (
          <Button onClick={cancel} disabled={working} autoFocus={options.destructive}>
            {options.cancelLabel ?? t("common.cancel")}
          </Button>
        )}
        <Button
          variant="contained"
          color={options.destructive ? "error" : "primary"}
          loading={working}
          onClick={() => void handleConfirm()}
          autoFocus={!options.destructive}
        >
          {options.confirmLabel ?? t("common.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
