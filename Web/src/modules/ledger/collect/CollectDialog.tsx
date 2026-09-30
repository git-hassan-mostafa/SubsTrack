import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { Collection, OpenItem } from "@shared/core/types";
import { useCollectForm, type CollectForm } from "@shared/modules/ledger/hooks/useCollectForm";
import { useCollectSubmit } from "@shared/modules/ledger/hooks/useCollectSubmit";
import { groupKey } from "@shared/modules/ledger/utils/currencyGroups";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";
import { CurrencyInput } from "@/shared/components/CurrencyInput";
import { DateField } from "@/shared/components/DateField";
import { FormDialog } from "@/shared/components/FormDialog";
import { CollectSummary } from "./CollectSummary";
import { CurrencyCollectSection } from "./CurrencyCollectSection";

export interface CollectTarget {
  customerId: string;
  customerName: string;
  items: OpenItem[];
  single: boolean;
}

interface CollectDialogProps {
  target: CollectTarget;
  onClose: () => void;
  onCollected: (collections: Collection[]) => void;
  header?: ReactNode;
}

function blockerKey(form: CollectForm): string {
  if (form.single) {
    if (form.single.plan.overpaying) return "web.collect.lower_amount";
    if (form.single.item.openAmount && !form.single.openBill) return "web.collect.type_month_amount";
    return "web.collect.type_amount";
  }
  return form.pool.overpaying ? "web.collect.lower_amount" : "web.collect.type_amount";
}

function SingleFields({ form }: { form: CollectForm }) {
  const { t } = useTranslation();
  const single = form.single!;
  const open = Boolean(single.item.openAmount);
  const overBy = single.plan.overpaying
    ? t("ledger.over_by_single", { max: single.money(single.plan.max) })
    : null;
  return (
    <Stack spacing={2.5}>
      {open ? (
        <Paper variant="outlined" sx={{ px: 2, py: 1.5 }}>
          <Typography variant="body2" color="text.secondary">
            {t("ledger.open_amount_hint")}
          </Typography>
        </Paper>
      ) : (
        <CollectSummary amount={single.money(single.plan.max)} billCount={1} />
      )}
      {open ? (
        <CurrencyInput
          label={t("ledger.month_amount")}
          amount={single.openBill}
          currencyId={single.currencyId}
          currencies={form.currencies}
          required
          onChange={single.setOpenBill}
        />
      ) : null}
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <Box sx={{ flex: 1 }}>
          <CurrencyInput
            label={t("ledger.amount")}
            amount={single.amount}
            currencyId={single.currencyId}
            currencies={form.currencies}
            lockCurrency
            error={overBy}
            onChange={(next) => single.setAmount(next.amount)}
          />
        </Box>
        {open ? null : (
          <Button onClick={single.collectAll} sx={{ mt: 1, flexShrink: 0 }}>
            {t("ledger.collect_all")}
          </Button>
        )}
      </Stack>
      {single.plan.partial ? (
        <Typography variant="body2" color="warning.dark">
          {t("ledger.partial_leaves_debt")}
        </Typography>
      ) : null}
    </Stack>
  );
}

function PoolFields({ form }: { form: CollectForm }) {
  const { t } = useTranslation();
  const { pool } = form;
  return (
    <Stack spacing={2.5}>
      <CollectSummary amount={pool.heroAmount} approx={pool.heroApprox} billCount={pool.billCount} />
      {pool.multiCurrency ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            {t("ledger.multi_currency_hint")}
          </Typography>
          <Button onClick={pool.collectEverything}>{t("ledger.collect_all")}</Button>
        </Stack>
      ) : null}
      {pool.plans.map((plan) => (
        <CurrencyCollectSection
          key={groupKey(plan)}
          plan={plan}
          currencies={form.currencies}
          display={form.display}
          excluded={pool.excluded}
          grouped={pool.multiCurrency}
          onChangeAmount={(amount) => pool.setAmount(groupKey(plan), amount)}
          onToggle={pool.toggle}
        />
      ))}
      {pool.multiCurrency ? (
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
          <Typography sx={{ fontWeight: 700 }}>{t("ledger.total_collecting")}</Typography>
          <Typography variant="h6" component="p" sx={{ fontWeight: 700 }}>
            {pool.collectingText}
          </Typography>
        </Stack>
      ) : null}
    </Stack>
  );
}

// The one door money comes in through on the web — one hand-over per currency.
export function CollectDialog({ target, onClose, onCollected, header }: CollectDialogProps) {
  const { t } = useTranslation();
  const error = useLedgerSlice((s) => s.error);
  const clearError = useLedgerSlice((s) => s.clearError);
  const form = useCollectForm(target.items, target.single ? target.items[0] : null);
  const submit = useCollectSubmit();
  const [blocker, setBlocker] = useState<string | null>(null);
  if (blocker && form.canSubmit) setBlocker(null);

  useEffect(() => {
    clearError();
  }, [clearError]);

  const save = async () => {
    const submission = form.submission();
    if (!submission) {
      setBlocker(t(blockerKey(form)));
      return;
    }
    const collections = await submit(submission, target.customerId);
    if (collections.length > 0) onCollected(collections);
  };

  return (
    <FormDialog
      open
      title={t("ledger.collect_money")}
      subtitle={target.single ? `${target.customerName} · ${target.items[0].label}` : target.customerName}
      onClose={onClose}
      onSubmit={save}
      dirty={form.dirty}
      error={blocker ?? error}
      onDismissError={() => {
        setBlocker(null);
        clearError();
      }}
    >
      {header}
      {form.single ? <SingleFields form={form} /> : <PoolFields form={form} />}
      <DateField
        label={t("ledger.received_at")}
        value={form.receivedAt}
        onChange={form.pickReceivedAt}
        showTime
      />
      <TextField
        label={t("ledger.notes")}
        placeholder={t("ledger.notes_placeholder")}
        value={form.notes}
        onChange={(event) => form.setNotes(event.target.value)}
        multiline
        minRows={2}
        fullWidth
      />
    </FormDialog>
  );
}
