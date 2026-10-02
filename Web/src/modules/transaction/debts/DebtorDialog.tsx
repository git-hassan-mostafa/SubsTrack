import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import CloseIcon from "@mui/icons-material/Close";
import NoteAddOutlined from "@mui/icons-material/NoteAddOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";
import PersonOutlined from "@mui/icons-material/PersonOutlined";
import RemoveCircleOutlineOutlined from "@mui/icons-material/RemoveCircleOutlineOutlined";
import type { CustomerDebts } from "@shared/core/types";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
import { useWrittenOffDebts, type DebtScope } from "@shared/modules/transaction/debts/hooks/useWrittenOffDebts";
import { sortDebts } from "@shared/modules/transaction/debts/utils/allDebtsFilter";
import { debtorOwedItems, debtorOwedUsd } from "@shared/modules/transaction/debts/utils/debtorView";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import { DialogHeading } from "@/shared/components/DialogHeading";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { RowActionsMenu } from "@/shared/table/RowActionsMenu";
import type { TableAction } from "@/shared/table/tableAction";
import { DebtItemsTable } from "./DebtItemsTable";
import { DebtScopeTabs } from "./DebtScopeTabs";
import type { DebtDoors } from "./useDebtDoors";

interface DebtorDialogProps {
  debtor: CustomerDebts;
  doors: DebtDoors;
  onClose: () => void;
}

// The page's own doors, so a collect or a bill opens above this dialog.
export function DebtorDialog({ debtor, doors, onClose }: DebtorDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const titleId = useId();
  const currencies = useCurrencySlice((s) => s.items);
  const display = findCurrency(currencies, useDisplayCurrencyId());
  const ledgerError = useLedgerSlice((s) => s.error);
  const clearLedgerError = useLedgerSlice((s) => s.clearError);
  const [scope, setScope] = useState<DebtScope>("live");
  const writtenOff = useWrittenOffDebts(debtor.customerId, debtor.customerName);
  const owed = debtorOwedItems(debtor);
  const total = formatMoney(debtorOwedUsd(debtor), null, display);
  const showingWrittenOff = scope === "written_off";
  const customer = { id: debtor.customerId, name: debtor.customerName };

  const menu: TableAction[] = [
    {
      key: "customer-page",
      group: "open",
      label: t("web.debts.open_customer"),
      icon: OpenInNewOutlined,
      onClick: () => void navigate(`/customers/${debtor.customerId}`),
    },
  ];
  if (owed.length > 0) {
    menu.push({
      key: "write-off-all",
      group: "danger",
      label: t("ledger.write_off_all"),
      caption: t("ledger.write_off_all_caption"),
      icon: RemoveCircleOutlineOutlined,
      destructive: true,
      onClick: () => doors.writeOffAll(debtor.customerName, owed),
    });
  }

  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth aria-labelledby={titleId}>
      <DialogTitle component="div" sx={{ paddingInlineEnd: 14 }}>
        <DialogHeading
          id={titleId}
          icon={PersonOutlined}
          tone="red"
          kind={t("web.debts.debtor")}
          title={debtor.customerName}
          subtitle={`${total} · ${t("debts.total_outstanding")}`}
        />
      </DialogTitle>
      <Stack direction="row" spacing={0.5} sx={{ position: "absolute", insetInlineEnd: 12, top: 12 }}>
        <RowActionsMenu rowLabel={debtor.customerName} actions={menu} />
        <IconButton aria-label={t("common.close")} onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Stack>
      <DialogContent dividers>
        <Stack spacing={2}>
          <ErrorBanner message={ledgerError} onDismiss={clearLedgerError} />
          {doors.banners}
          <DebtScopeTabs value={scope} onChange={setScope} />
          {showingWrittenOff ? (
            <DebtItemsTable
              label={t("debts.scope_written_off")}
              items={sortDebts(writtenOff.items)}
              doors={doors}
              loading={writtenOff.loading}
              emptyText={t("debts.no_written_off")}
            />
          ) : (
            <DebtItemsTable
              label={t("debts.scope_live")}
              items={sortDebts(owed)}
              doors={doors}
              emptyText={t("debts.no_transactions_for_customer")}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>{t("common.close")}</Button>
        <Button variant="outlined" startIcon={<NoteAddOutlined />} onClick={() => doors.addCustomDebt(customer)}>
          {t("debts.add_custom_debt")}
        </Button>
        {!showingWrittenOff && owed.length > 0 ? (
          <Button
            variant="contained"
            onClick={() => doors.collectAll(debtor.customerId, debtor.customerName, owed)}
          >
            {t("ledger.collect_amount", { amount: total })}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
