import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import type { WhatsAppMessage, WhatsAppMessageStatus } from "@shared/core/types";
import { formatDateTimeShort } from "@shared/core/utils/date";
import { useMessageHistoryStore } from "@shared/modules/whatsapp/state/messageHistoryStore";
import { HISTORY_STATUS_FILTERS } from "@shared/modules/whatsapp/utils/constants";
import { whatsAppMessageItems } from "@shared/modules/whatsapp/utils/whatsappMenu";
import {
  cancelBatchConfirm,
  messageCustomerName,
  messageErrorText,
  messageStatusLabel,
  messageStatusTone,
  messageTitle,
} from "@shared/modules/whatsapp/utils/whatsappView";
import { confirm } from "@shared/shared/lib/confirm";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { StatusChip } from "@/shared/components/StatusChip";
import { DataTable } from "@/shared/table/DataTable";
import { FilterSelect } from "@/shared/table/FilterSelect";
import { RowLink } from "@/shared/table/RowLink";
import { toTableActions, type TableAction } from "@/shared/table/tableAction";
import { usePagedTable } from "@/shared/table/usePagedTable";
import { useWhatsAppHistoryTable } from "@/state/whatsappHistoryTable";
import { WHATSAPP_MESSAGE_ACTION_ICONS } from "../utils/whatsappActionIcons";

const STATUS_OPTIONS = HISTORY_STATUS_FILTERS.filter(
  (filter): filter is WhatsAppMessageStatus => filter !== "all",
);

// Cancelling stops the whole send it came from, so the page re-reads after it.
export function WhatsAppHistoryPage() {
  const { t } = useTranslation();
  const branch = useEffectiveBranchFilter();
  const paged = usePagedTable(useWhatsAppHistoryTable, branch);
  const { query, setFilters, reload } = paged;
  const cancelBatch = useMessageHistoryStore((s) => s.cancelBatch);
  const cancelError = useMessageHistoryStore((s) => s.error);
  const clearCancelError = useMessageHistoryStore((s) => s.clearError);

  const cancel = (message: WhatsAppMessage) =>
    void confirm({
      ...cancelBatchConfirm(t),
      onConfirm: async () => {
        await cancelBatch(message.batchId);
        reload();
      },
    });

  const rowActions = (message: WhatsAppMessage): TableAction[] =>
    toTableActions(whatsAppMessageItems(message), t, {
      icons: WHATSAPP_MESSAGE_ACTION_ICONS,
      run: { cancel_batch: () => cancel(message) },
    });

  const columns: GridColDef<WhatsAppMessage>[] = [
    {
      field: "createdAt",
      headerName: t("web.whatsapp.sent_at"),
      width: 170,
      valueGetter: (_value, row) => formatDateTimeShort(row.createdAt),
    },
    {
      field: "customer",
      headerName: t("web.whatsapp.customer"),
      flex: 1,
      minWidth: 180,
      valueGetter: (_value, row) => messageCustomerName(row, t),
      renderCell: (params) =>
        params.row.customerId ? (
          <RowLink
            label={messageCustomerName(params.row, t)}
            tabIndex={params.tabIndex}
            href={`/customers/${params.row.customerId}`}
          />
        ) : (
          messageCustomerName(params.row, t)
        ),
    },
    {
      field: "message",
      headerName: t("web.whatsapp.message"),
      flex: 1,
      minWidth: 180,
      valueGetter: (_value, row) => messageTitle(row, t),
    },
    {
      field: "status",
      headerName: t("web.status"),
      width: 140,
      renderCell: (params) => (
        <StatusChip
          label={messageStatusLabel(params.row.status, t)}
          tone={messageStatusTone(params.row.status)}
        />
      ),
    },
    {
      field: "details",
      headerName: t("web.whatsapp.details"),
      flex: 1.5,
      minWidth: 240,
      renderCell: (params) => (
        <Typography variant="body2" color="error" sx={{ whiteSpace: "normal", lineHeight: 1.5 }}>
          {messageErrorText(params.row, t)}
        </Typography>
      ),
    },
  ];

  return (
    <Stack spacing={2}>
      <ErrorBanner message={cancelError} onDismiss={clearCancelError} />
      <DataTable<WhatsAppMessage>
        viewKey="whatsapp-history"
        label={t("whatsapp.history_title")}
        columns={columns}
        {...paged.tableProps}
        filters={
          <FilterSelect<WhatsAppMessageStatus | null>
            label={t("web.status")}
            anyLabel={t("whatsapp.filter_all")}
            value={query.filters.status}
            onChange={(status) => setFilters({ status })}
            options={STATUS_OPTIONS.map((status) => ({ value: status, label: messageStatusLabel(status, t) }))}
          />
        }
        rowLabel={(message) => messageCustomerName(message, t)}
        rowActions={rowActions}
        empty={{ title: t("whatsapp.history_empty"), hint: t("web.whatsapp.history_empty_hint") }}
        filtered={query.filters.status !== null}
        autoRowHeight
      />
    </Stack>
  );
}
