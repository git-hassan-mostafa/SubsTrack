import { useId } from "react";
import { useTranslation } from "react-i18next";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { Customer, WhatsAppTemplatePurpose } from "@shared/core/types";
import {
  useSendWhatsAppForm,
  type SendResultView,
} from "@shared/modules/whatsapp/hooks/useSendWhatsAppForm";
import type { PlaceholderSource } from "@shared/modules/whatsapp/utils/templateValues";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { FormDialog } from "@/shared/components/FormDialog";
import { SearchableSelect } from "@/shared/components/SearchableSelect";

interface SendWhatsAppDialogProps {
  customers: Customer[];
  purpose: WhatsAppTemplatePurpose | null;
  onClose: () => void;
}

export function SendWhatsAppDialog({ customers, purpose, onClose }: SendWhatsAppDialogProps) {
  const { t } = useTranslation();
  const form = useSendWhatsAppForm(customers, purpose);

  if (form.result) {
    return (
      <SendResultDialog
        result={form.result}
        sending={form.sending}
        error={form.error}
        onDismissError={form.clearError}
        onSendAgain={() => void form.sendAgain(form.result?.recentCustomers ?? [])}
        onClose={onClose}
      />
    );
  }

  return (
    <FormDialog
      open
      title={t("whatsapp.send_title")}
      subtitle={t("whatsapp.recipients_count", { count: customers.length })}
      onClose={onClose}
      onSubmit={form.send}
      dirty={form.fields.some((field) => field.choice.text !== "")}
      error={form.error}
      onDismissError={form.clearError}
      submitLabel={t("whatsapp.send_button", { count: customers.length })}
      submitDisabled={!form.canSend}
    >
      {!form.hasTemplates ? (
        <Typography variant="body2" color="text.secondary">
          {t("whatsapp.no_approved_templates")}
        </Typography>
      ) : (
        <>
          <SearchableSelect<string>
            label={t("whatsapp.message_type")}
            value={form.templateId}
            onChange={form.pickTemplate}
            options={form.templateOptions}
            fullWidth
          />
          {form.fields.map((field) => (
            <Stack key={field.param} spacing={2}>
              {field.pickSource ? (
                <TextField
                  select
                  label={t("whatsapp.placeholder_label", { name: field.param })}
                  value={field.choice.source}
                  onChange={(event) =>
                    form.updateChoice(field.param, { source: event.target.value as PlaceholderSource })
                  }
                >
                  {form.sourceOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              ) : null}
              {field.choice.source === "custom" ? (
                <TextField
                  label={field.textLabel}
                  required
                  value={field.choice.text}
                  onChange={(event) => form.updateChoice(field.param, { text: event.target.value })}
                  slotProps={{ htmlInput: { maxLength: field.maxLength } }}
                  helperText={`${field.choice.text.length} / ${field.maxLength}`}
                  multiline
                  minRows={2}
                />
              ) : null}
            </Stack>
          ))}
          {form.template ? (
            <Paper variant="outlined" sx={{ p: 2, bgcolor: "background.default" }}>
              <Typography variant="overline" color="text.secondary">
                {t("whatsapp.preview")}
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
                {form.preview}
              </Typography>
            </Paper>
          ) : null}
          <Typography variant="body2" color="text.secondary">
            {t("whatsapp.billing_note")}
          </Typography>
        </>
      )}
    </FormDialog>
  );
}

interface SendResultDialogProps {
  result: SendResultView;
  sending: boolean;
  error: string | null;
  onDismissError: () => void;
  onSendAgain: () => void;
  onClose: () => void;
}

function SendResultDialog({ result, sending, error, onDismissError, onSendAgain, onClose }: SendResultDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const again = result.recentCustomers.length;
  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} maxWidth="sm" fullWidth>
      <DialogTitle id={titleId} sx={{ fontWeight: 700 }}>
        {t("whatsapp.send_title")}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <ErrorBanner message={error} onDismiss={onDismissError} />
          <Alert severity="success">
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {result.queuedText}
            </Typography>
            <Typography variant="body2">{t("whatsapp.queued_hint")}</Typography>
          </Alert>
          {result.skipTexts.length > 0 ? (
            <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2.5 }}>
              {result.skipTexts.map((text) => (
                <Typography key={text} component="li" variant="body2">
                  {text}
                </Typography>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        {again > 0 ? (
          <Button variant="outlined" loading={sending} onClick={onSendAgain}>
            {t("whatsapp.send_again_anyway", { count: again })}
          </Button>
        ) : null}
        <Button variant="contained" onClick={onClose} disabled={sending}>
          {t("common.close")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
