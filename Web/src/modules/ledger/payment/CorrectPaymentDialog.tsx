import { useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { formatDateTime } from "@shared/core/utils/date";
import { useCorrectPayment } from "@shared/modules/ledger/hooks/useCorrectPayment";
import type { CollectionCorrection } from "@shared/modules/ledger/services/CollectionService";
import type { CorrectionProblem } from "@shared/modules/ledger/utils/correction";
import { stillOwedAfter } from "@shared/modules/ledger/utils/currencyGroups";
import { useUserNames } from "@shared/shared/hooks/useUserNames";
import { FormDialog } from "@/shared/components/FormDialog";
import { InfoRows } from "@/shared/components/InfoRows";
import { BillsTable } from "../collect/BillsTable";
import { CurrencyAmountField } from "../collect/CurrencyAmountField";

const NO_SKIPS: ReadonlySet<string> = new Set();

const PROBLEM_KEYS: Record<CorrectionProblem, string> = {
  zero: "ledger.correct_zero_hint",
  unchanged: "web.correct.type_new_amount",
  too_much: "web.collect.lower_amount",
};

interface CorrectPaymentDialogProps {
  collectionId: string;
  onDone: (result: CollectionCorrection) => void;
  onClose: () => void;
}

// A mistyped amount: void the hand-over and re-record it on the SAME bills (#171).
export function CorrectPaymentDialog({ collectionId, onDone, onClose }: CorrectPaymentDialogProps) {
  const { t } = useTranslation();
  const userName = useUserNames();
  const form = useCorrectPayment(collectionId);
  const [blocker, setBlocker] = useState<string | null>(null);
  if (blocker && form.canSave) setBlocker(null);
  const { original, plan, money } = form;

  const save = async () => {
    if (!original || !plan) return;
    if (form.problem) {
      setBlocker(t(PROBLEM_KEYS[form.problem]));
      return;
    }
    const result = await form.save();
    if (result) onDone(result);
  };

  return (
    <FormDialog
      open
      title={t("ledger.correct_payment")}
      subtitle={form.draft?.pool[0]?.customerName || undefined}
      onClose={onClose}
      onSubmit={save}
      dirty={form.dirty}
      error={blocker ?? form.error ?? form.loadError}
      onDismissError={() => {
        setBlocker(null);
        form.clearError();
      }}
      submitLabel={t("ledger.save_correction")}
      maxWidth="md"
    >
      {!form.draft && !form.loadError ? (
        <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
          <CircularProgress aria-label={t("web.loading")} />
        </Box>
      ) : null}
      {original && plan ? (
        <>
          <Paper variant="outlined" sx={{ px: 2, py: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              {t("ledger.correct_hint")}
            </Typography>
          </Paper>
          <InfoRows
            rows={[
              { label: t("ledger.recorded_amount"), value: money(original.amount) },
              { label: t("ledger.received_at"), value: formatDateTime(original.receivedAt) },
              {
                label: t("ledger.collected_by"),
                value: userName(original.receivedByUserId) ?? t("common.unknown"),
              },
            ]}
          />
          <CurrencyAmountField
            plan={plan}
            currencies={form.currencies}
            grouped={false}
            onChangeAmount={form.setAmount}
          />
          <BillsTable
            title={t("web.collect.bills_title")}
            items={plan.items}
            lines={plan.lines}
            excluded={NO_SKIPS}
            money={money}
            remainingAfter={stillOwedAfter(plan)}
          />
          <TextField
            label={t("ledger.correct_note")}
            placeholder={t("ledger.correct_note_placeholder")}
            value={form.note}
            onChange={(event) => form.setNote(event.target.value)}
            multiline
            minRows={2}
            fullWidth
          />
        </>
      ) : null}
    </FormDialog>
  );
}
