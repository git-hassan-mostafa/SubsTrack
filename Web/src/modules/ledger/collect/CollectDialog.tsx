import { useEffect, useState, type ReactNode } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { Collection, OpenItem } from "@shared/core/types";
import { formatMoney, formatMoneyPair } from "@shared/core/utils/currency";
import { daysLate, formatDate } from "@shared/core/utils/date";
import { useCollectForm, type CollectForm } from "@shared/modules/ledger/hooks/useCollectForm";
import { useCollectSubmit } from "@shared/modules/ledger/hooks/useCollectSubmit";
import { collectBlocker } from "@shared/modules/ledger/utils/allocationRows";
import { groupKey, stillOwedAfter, type CurrencyPlan } from "@shared/modules/ledger/utils/currencyGroups";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";
import { CurrencyInput } from "@/shared/components/CurrencyInput";
import { DateField } from "@/shared/components/DateField";
import { FormDialog } from "@/shared/components/FormDialog";
import { BillsTable } from "./BillsTable";
import { CollectSummary } from "./CollectSummary";
import { CurrencyAmountField } from "./CurrencyAmountField";

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

function dueText(item: OpenItem, t: TFunction): string {
  const late = daysLate(item.dueDate);
  return [
    t("ledger.due_on", { date: formatDate(item.dueDate) }),
    late > 0 ? t("ledger.days_late", { count: late }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function HandOverFields({ form }: { form: CollectForm }) {
  const { t } = useTranslation();
  return (
    <>
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
    </>
  );
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
      <Paper variant="outlined" sx={{ px: 2, py: 1.5 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600 }}>{single.item.label}</Typography>
            <Typography variant="body2" color="text.secondary">
              {open ? t("ledger.open_amount_hint") : dueText(single.item, t)}
            </Typography>
          </Box>
          {open ? null : (
            <Box sx={{ textAlign: "end" }}>
              <Typography variant="body2" color="text.secondary">
                {t("ledger.owed")}
              </Typography>
              <Typography variant="h6" component="p" sx={{ fontWeight: 700 }}>
                {single.money(single.plan.max)}
              </Typography>
            </Box>
          )}
        </Stack>
      </Paper>
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
      <HandOverFields form={form} />
    </Stack>
  );
}

function billsCaption(plan: CurrencyPlan, form: CollectForm, t: TFunction): string {
  const { primary, approx } = formatMoneyPair(plan.owed, plan.currency, form.display);
  const owed = t("ledger.amount_owed", { amount: primary });
  return approx ? `${owed} · ${approx}` : owed;
}

// Where the money goes on the left, what was handed over on the right.
function PoolFields({ form }: { form: CollectForm }) {
  const { t } = useTranslation();
  const { pool } = form;
  const canSkip = pool.plans.some((plan) => plan.items.length > 1);
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 340px" },
        gap: 3,
        alignItems: "start",
      }}
    >
      <Stack spacing={2.5}>
        {canSkip ? (
          <Typography variant="body2" color="text.secondary">
            {t("web.collect.skip_hint")}
          </Typography>
        ) : null}
        {pool.plans.map((plan) => (
          <BillsTable
            key={groupKey(plan)}
            title={pool.multiCurrency ? (plan.currency?.code ?? "USD") : t("web.collect.bills_title")}
            caption={pool.multiCurrency ? billsCaption(plan, form, t) : undefined}
            items={plan.items}
            lines={plan.lines}
            excluded={pool.excluded}
            onToggle={pool.toggle}
            money={(value) => formatMoney(value, plan.currency, plan.currency)}
            remainingAfter={stillOwedAfter(plan)}
          />
        ))}
      </Stack>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2.5}>
          <CollectSummary amount={pool.heroAmount} approx={pool.heroApprox} billCount={pool.billCount} />
          <Divider />
          {pool.multiCurrency ? (
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                {t("ledger.multi_currency_hint")}
              </Typography>
              <Button onClick={pool.collectEverything} sx={{ flexShrink: 0 }}>
                {t("ledger.collect_all")}
              </Button>
            </Stack>
          ) : null}
          {pool.plans.map((plan) => (
            <CurrencyAmountField
              key={groupKey(plan)}
              plan={plan}
              currencies={form.currencies}
              grouped={pool.multiCurrency}
              onChangeAmount={(amount) => pool.setAmount(groupKey(plan), amount)}
            />
          ))}
          {pool.multiCurrency ? (
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <Typography sx={{ fontWeight: 700 }}>{t("ledger.total_collecting")}</Typography>
              <Typography variant="h6" component="p" sx={{ fontWeight: 700 }}>
                {pool.collectingText}
              </Typography>
            </Stack>
          ) : null}
          <HandOverFields form={form} />
        </Stack>
      </Paper>
    </Box>
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
      setBlocker(t(`web.collect.${collectBlocker(form)}`));
      return;
    }
    const collections = await submit(submission, target.customerId);
    if (collections.length > 0) onCollected(collections);
  };

  return (
    <FormDialog
      open
      title={t("ledger.collect_money")}
      subtitle={target.customerName}
      onClose={onClose}
      onSubmit={save}
      dirty={form.dirty}
      error={blocker ?? error}
      onDismissError={() => {
        setBlocker(null);
        clearError();
      }}
      maxWidth={form.single ? "sm" : "lg"}
    >
      {header ? <Box sx={{ maxWidth: 480 }}>{header}</Box> : null}
      {form.single ? <SingleFields form={form} /> : <PoolFields form={form} />}
    </FormDialog>
  );
}
