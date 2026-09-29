import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import type { QuotaErrorPayload } from "@shared/modules/admin/billing/utils/types";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";

interface QuotaReachedDialogProps {
  payload: QuotaErrorPayload | null;
  onClose: () => void;
  onNavigate?: () => void;
}

// Closing keeps the form open; only "Organization settings" leaves it.
export function QuotaReachedDialog({ payload, onClose, onNavigate }: QuotaReachedDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isTenantWideAdmin } = useAuth();
  const titleId = useId();

  if (!payload) return null;

  const goToSettings = () => {
    onClose();
    onNavigate?.();
    void navigate("/admin/organization");
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth aria-labelledby={titleId}>
      <DialogTitle id={titleId} sx={{ fontWeight: 700 }}>
        {t(`billing.limit_reached_title_${payload.kind}`)}
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          {isTenantWideAdmin
            ? t(`billing.limit_reached_body_${payload.kind}`, {
                count: payload.activeCount,
                allowance: payload.limit,
              })
            : t("billing.limit_reached_contact_admin")}
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>{t("common.close")}</Button>
        {isTenantWideAdmin ? (
          <Button variant="contained" onClick={goToSettings}>
            {t("billing.go_to_settings")}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
