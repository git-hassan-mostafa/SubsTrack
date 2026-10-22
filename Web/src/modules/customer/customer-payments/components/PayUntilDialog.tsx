import { useId } from "react";
import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import type { PayUntilOption } from "@shared/modules/customer/customer-payments/hooks/useCustomerMonthGrid";

interface PayUntilDialogProps {
  options: PayUntilOption[];
  onPick: (key: string) => void;
  onClose: () => void;
}

// Picking a month opens the collect dialog; nothing is saved here.
export function PayUntilDialog({ options, onPick, onClose }: PayUntilDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth aria-labelledby={titleId}>
      <DialogTitle id={titleId} sx={{ fontWeight: 700 }}>
        {t("payments.pay_until_title")}
      </DialogTitle>
      <DialogContent sx={{ px: 1 }}>
        <List disablePadding>
          {options.map((option) => (
            <ListItemButton key={option.key} onClick={() => onPick(option.key)} sx={{ borderRadius: 1 }}>
              <ListItemText primary={option.label} secondary={option.paidUntil} />
              <Typography sx={{ fontWeight: 700, ms: 2, whiteSpace: "nowrap" }}>{option.total}</Typography>
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
      </DialogActions>
    </Dialog>
  );
}
