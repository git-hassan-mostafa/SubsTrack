import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NoteAddOutlined from "@mui/icons-material/NoteAddOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import RemoveCircleOutlineOutlined from "@mui/icons-material/RemoveCircleOutlineOutlined";
import type { Customer } from "@shared/core/types";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
import { owedUsd } from "@shared/modules/ledger/utils/debtRule";
import { useCustomerDebts } from "@shared/modules/transaction/debts/hooks/useCustomerDebts";
import { useWrittenOffDebts, type DebtScope } from "@shared/modules/transaction/debts/hooks/useWrittenOffDebts";
import { sortDebts } from "@shared/modules/transaction/debts/utils/allDebtsFilter";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { PanelSection } from "@/shared/components/PanelSection";
import { RowActionsMenu } from "@/shared/table/RowActionsMenu";
import { DebtItemsTable } from "./DebtItemsTable";
import { DebtScopeTabs } from "./DebtScopeTabs";
import { useDebtDoors } from "./useDebtDoors";

// Plain unpaid months stay out: the months above already show them.
export function CustomerDebtsPanel({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const display = findCurrency(currencies, useDisplayCurrencyId());
  const debts = useCustomerDebts(customer.id, customer.name);
  const writtenOff = useWrittenOffDebts(customer.id, customer.name);
  const [scope, setScope] = useState<DebtScope>("live");
  const { refresh } = debts;
  const recipientOf = useCallback(
    () => ({ name: customer.name, phone: customer.phoneNumber }),
    [customer.name, customer.phoneNumber],
  );
  const doors = useDebtDoors({ recipientOf });

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const showingWrittenOff = scope === "written_off";
  const source = showingWrittenOff ? writtenOff : debts;
  const live = debts.items;
  const owing = !showingWrittenOff && live.length > 0;

  const headerActions = (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      {owing ? (
        <Typography sx={{ fontWeight: 700 }}>
          {t("web.customer_detail.owed_total", { amount: formatMoney(owedUsd(live), null, display) })}
        </Typography>
      ) : null}
      <Button variant="outlined" startIcon={<NoteAddOutlined />} onClick={() => doors.addCustomDebt(customer)}>
        {t("debts.add_custom_debt")}
      </Button>
      {owing ? (
        <>
          <Button
            variant="outlined"
            startIcon={<PaymentsOutlined />}
            onClick={() => doors.collectAll(customer.id, customer.name, live)}
          >
            {t("ledger.collect_all")}
          </Button>
          <RowActionsMenu
            rowLabel={t("debts.customer_panel_title")}
            actions={[
              {
                key: "write-off-all",
                group: "danger",
                label: t("ledger.write_off_all"),
                caption: t("ledger.write_off_all_caption"),
                icon: RemoveCircleOutlineOutlined,
                destructive: true,
                onClick: () => doors.writeOffAll(customer.name, live),
              },
            ]}
          />
        </>
      ) : null}
    </Stack>
  );

  return (
    <PanelSection title={t("debts.customer_panel_title")} actions={headerActions}>
      <ErrorBanner message={source.error} onDismiss={source.clearError} />
      {doors.banners}
      <DebtScopeTabs value={scope} onChange={setScope} />
      <DebtItemsTable
        label={t("debts.customer_panel_title")}
        items={sortDebts(source.items)}
        doors={doors}
        loading={source.loading}
        emptyText={showingWrittenOff ? t("debts.no_written_off") : t("web.customer_detail.no_debts")}
      />
      {doors.dialogs}
    </PanelSection>
  );
}
