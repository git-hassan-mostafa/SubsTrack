import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { BranchFilter } from "@shared/core/constants";
import type { ChargeKind, DebtsView } from "@shared/core/types";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
import { useAllWrittenOffDebts } from "@shared/modules/transaction/debts/hooks/useAllWrittenOffDebts";
import type { DebtScope } from "@shared/modules/transaction/debts/hooks/useWrittenOffDebts";
import {
  ALL_DEBTS_SORTS,
  ALL_DEBTS_STATUSES,
  DEBT_KINDS,
  DEFAULT_ALL_DEBTS_FILTERS,
  filterAndSortDebts,
  hasActiveAllDebtsFilters,
  selectAllDebts,
  totalUsdOf,
  type AllDebtsFilters,
  type AllDebtsSort,
  type AllDebtsStatus,
} from "@shared/modules/transaction/debts/utils/allDebtsFilter";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { SearchField } from "@/shared/components/SearchField";
import { FilterBar } from "@/shared/table/FilterBar";
import { FilterSelect } from "@/shared/table/FilterSelect";
import { DebtItemsTable } from "./DebtItemsTable";
import type { DebtDoors } from "./useDebtDoors";

interface AllDebtsTabProps {
  view: DebtsView | null;
  branch: BranchFilter;
  doors: DebtDoors;
}

// Reads the view the page holds, so this total and the page's always agree.
export function AllDebtsTab({ view, branch, doors }: AllDebtsTabProps) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const display = findCurrency(currencies, useDisplayCurrencyId());
  const [filters, setFilters] = useState<AllDebtsFilters>(DEFAULT_ALL_DEBTS_FILTERS);
  const [scope, setScope] = useState<DebtScope>("live");
  const showingWrittenOff = scope === "written_off";
  const writtenOff = useAllWrittenOffDebts(branch);

  const active = useMemo(
    () => ({ ...filters, status: showingWrittenOff ? null : filters.status }),
    [filters, showingWrittenOff],
  );
  const rows = useMemo(
    () => (showingWrittenOff ? filterAndSortDebts(writtenOff.items, active) : selectAllDebts(view, active)),
    [showingWrittenOff, writtenOff.items, view, active],
  );
  const dirty = hasActiveAllDebtsFilters(active) || showingWrittenOff;
  const patch = (next: Partial<AllDebtsFilters>) => setFilters((prev) => ({ ...prev, ...next }));
  const setSearch = useCallback(
    (search: string) => setFilters((prev) => (prev.search === search ? prev : { ...prev, search })),
    [],
  );
  const clearAll = () => {
    setFilters(DEFAULT_ALL_DEBTS_FILTERS);
    setScope("live");
  };

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" }, minWidth: 0 }}>
        <SearchField
          value={filters.search}
          onSearch={setSearch}
          placeholder={t("debts.all_debts_search_hint")}
        />
        <FilterBar>
          <FilterSelect<DebtScope>
            label={t("debts.filter_by_scope")}
            value={scope}
            onChange={setScope}
            options={[
              { value: "live", label: t("debts.scope_live") },
              { value: "written_off", label: t("debts.scope_written_off") },
            ]}
          />
          <FilterSelect<ChargeKind | null>
            label={t("ledger.filter_by_type")}
            anyLabel={t("ledger.all_types")}
            value={filters.kind}
            onChange={(kind) => patch({ kind })}
            options={DEBT_KINDS.map((kind) => ({ value: kind, label: t(`ledger.kind_${kind}`) }))}
          />
          {showingWrittenOff ? null : (
            <FilterSelect<AllDebtsStatus | null>
              label={t("ledger.filter_by_status")}
              anyLabel={t("ledger.all_statuses")}
              value={filters.status}
              onChange={(status) => patch({ status })}
              options={ALL_DEBTS_STATUSES.map((status) => ({ value: status, label: t(`debts.status_${status}`) }))}
            />
          )}
          <FilterSelect<AllDebtsSort>
            label={t("ledger.sort_by_label")}
            value={filters.sort}
            onChange={(sort) => patch({ sort })}
            options={ALL_DEBTS_SORTS.map((sort) => ({ value: sort, label: t(`debts.sort_${sort}`) }))}
          />
          {dirty ? <Button onClick={clearAll}>{t("common.clear_filters")}</Button> : null}
        </FilterBar>
      </Stack>
      {showingWrittenOff ? <ErrorBanner message={writtenOff.error} onDismiss={writtenOff.clearError} /> : null}
      <Paper variant="outlined" sx={{ px: 2, py: 1.5 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "baseline", justifyContent: "space-between" }}>
          <Typography variant="body2" color="text.secondary">
            {t(showingWrittenOff ? "web.debts.written_off_total" : "web.debts.shown_total", {
              count: rows.length,
            })}
          </Typography>
          <Typography sx={{ fontWeight: 700, color: showingWrittenOff ? "text.secondary" : "error.main" }}>
            {formatMoney(totalUsdOf(rows), null, display)}
          </Typography>
        </Stack>
      </Paper>
      <Box>
        <DebtItemsTable
          label={showingWrittenOff ? t("debts.scope_written_off") : t("debts.all_debts_title")}
          items={rows}
          doors={doors}
          loading={showingWrittenOff && writtenOff.loading}
          emptyText={showingWrittenOff ? t("debts.no_written_off_any") : t("debts.no_debts")}
          showCustomer
        />
      </Box>
    </Stack>
  );
}
