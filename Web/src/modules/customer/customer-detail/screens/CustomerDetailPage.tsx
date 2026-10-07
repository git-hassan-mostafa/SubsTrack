import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
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
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import type { Customer } from "@shared/core/types";
import { customerStatusItems } from "@shared/modules/customer/customers/utils/customerMenu";
import { useCustomerSlice } from "@shared/state/hooks/useCustomerSlice";
import { EmptyState } from "@/shared/components/EmptyState";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { RowActionsMenu } from "@/shared/table/RowActionsMenu";
import { toTableActions } from "@/shared/table/tableAction";
import { CustomerFormDialog } from "@/modules/customer/customers/components/CustomerFormDialog";
import { useCustomerAdminActions } from "@/modules/customer/customers/hooks/useCustomerAdminActions";
import { useCustomerHistoryAction } from "@/modules/customer/customers/hooks/useCustomerHistoryAction";
import { CUSTOMER_ACTION_ICONS } from "@/modules/customer/customers/utils/customerActionIcons";
import { MonthPanel } from "@/modules/customer/customer-payments/components/MonthPanel";
import { CustomerDebtsPanel } from "@/modules/transaction/debts/components/CustomerDebtsPanel";
import { CustomerSalesPanel } from "@/modules/transaction/sales/components/CustomerSalesPanel";
import { useWhatsAppDoors } from "@/modules/whatsapp/hooks/useWhatsAppDoors";
import { CustomerDetailsPanel } from "../components/CustomerDetailsPanel";

const CUSTOMERS_PATH = "/customers";

// Opening the page reads the customer fresh; each panel reads its own money.
export function CustomerDetailPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const customer = useCustomerSlice((s) => s.items.find((c) => c.id === id) ?? null);
  const loading = useCustomerSlice((s) => s.loading);
  const error = useCustomerSlice((s) => s.error);
  const clearError = useCustomerSlice((s) => s.clearError);
  const fetchCustomer = useCustomerSlice((s) => s.fetchCustomer);
  const adminActions = useCustomerAdminActions();
  const history = useCustomerHistoryAction();
  const whatsapp = useWhatsAppDoors();
  const [editing, setEditing] = useState(false);
  const [readId, setReadId] = useState<string | null>(null);
  const read = readId === id;

  useEffect(() => {
    if (!id) return;
    void fetchCustomer(id).finally(() => setReadId(id));
  }, [id, fetchCustomer]);

  const backLabel = t("web.customer_detail.back");

  const removeCustomer = async (target: Customer) => {
    const { hardDeleted } = await adminActions.remove([target]);
    if (hardDeleted) void navigate(CUSTOMERS_PATH);
  };

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
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Button variant="outlined" startIcon={<HistoryOutlined />} onClick={() => history.open(customer)}>
              {t("audit.history")}
            </Button>
            <Button variant="outlined" startIcon={<EditOutlined />} onClick={() => setEditing(true)}>
              {t("common.edit")}
            </Button>
            <RowActionsMenu
              rowLabel={customer.name}
              actions={[
                ...whatsapp.rowActions(customer),
                ...toTableActions(customerStatusItems(customer, { isAdmin }), t, {
                  icons: CUSTOMER_ACTION_ICONS,
                  run: {
                    deactivate: () => void adminActions.toggleActive(customer),
                    reactivate: () => void adminActions.toggleActive(customer),
                    delete: () => void removeCustomer(customer),
                  },
                }),
              ]}
            />
          </Stack>
        ) : null}
      </Stack>

      <ErrorBanner message={editing ? null : error} onDismiss={clearError} />

      {customer ? (
        <Stack key={customer.id} spacing={4}>
          <MonthPanel customer={customer} />
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) minmax(0, 2fr)" },
              gap: 4,
              alignItems: "start",
            }}
          >
            <CustomerDetailsPanel customer={customer} />
            <CustomerDebtsPanel customer={customer} />
          </Box>
          <CustomerSalesPanel customer={customer} />
        </Stack>
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
      {whatsapp.dialog}
    </Stack>
  );
}
