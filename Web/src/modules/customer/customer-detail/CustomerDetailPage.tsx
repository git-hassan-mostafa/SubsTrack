import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ArrowBack from "@mui/icons-material/ArrowBack";
import EditOutlined from "@mui/icons-material/EditOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import { useCustomerSlice } from "@shared/state/hooks/useCustomerSlice";
import { EmptyState } from "@/shared/components/EmptyState";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { CustomerFormDialog } from "@/modules/customer/customers/CustomerFormDialog";
import { useCustomerHistoryAction } from "@/modules/customer/customers/useCustomerHistoryAction";
import { MonthPanel } from "@/modules/customer/customer-payments/MonthPanel";

const CUSTOMERS_PATH = "/customers";

// Opening the page reads the customer fresh; its months are read by the panel.
export function CustomerDetailPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams<{ id: string }>();
  const customer = useCustomerSlice((s) => s.items.find((c) => c.id === id) ?? null);
  const loading = useCustomerSlice((s) => s.loading);
  const error = useCustomerSlice((s) => s.error);
  const clearError = useCustomerSlice((s) => s.clearError);
  const fetchCustomer = useCustomerSlice((s) => s.fetchCustomer);
  const history = useCustomerHistoryAction();
  const [editing, setEditing] = useState(false);
  const [readId, setReadId] = useState<string | null>(null);
  const read = readId === id;

  useEffect(() => {
    if (!id) return;
    void fetchCustomer(id).finally(() => setReadId(id));
  }, [id, fetchCustomer]);

  const backLabel = t("web.customer_detail.back");

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
        <Tooltip title={backLabel}>
          <IconButton href={CUSTOMERS_PATH} aria-label={backLabel}>
            <ArrowBack />
          </IconButton>
        </Tooltip>
        <Typography variant="h5" component="h2" sx={{ fontWeight: 700, flexGrow: 1, minWidth: 0 }} noWrap>
          {customer?.name ?? ""}
        </Typography>
        {customer ? (
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" startIcon={<HistoryOutlined />} onClick={history.action(customer).onClick}>
              {t("audit.history")}
            </Button>
            <Button variant="outlined" startIcon={<EditOutlined />} onClick={() => setEditing(true)}>
              {t("common.edit")}
            </Button>
          </Stack>
        ) : null}
      </Stack>

      <ErrorBanner message={editing ? null : error} onDismiss={clearError} />

      {customer ? (
        <MonthPanel key={customer.id} customer={customer} />
      ) : !read || loading ? (
        <Box sx={{ py: 8, display: "flex", justifyContent: "center" }}>
          <CircularProgress aria-label={t("web.loading")} />
        </Box>
      ) : (
        <Paper variant="outlined">
          <EmptyState
            title={t("web.customer_detail.not_found")}
            hint={t("web.customer_detail.not_found_hint")}
          />
        </Paper>
      )}

      {editing && customer ? (
        <CustomerFormDialog customer={customer} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
      ) : null}
      {history.dialog}
    </Stack>
  );
}
