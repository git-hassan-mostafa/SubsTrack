import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { useStore } from "zustand";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ArrowBack from "@mui/icons-material/ArrowBack";
import { useOwedChanged } from "@shared/modules/ledger/hooks/useOwedChanged";
import { useCustomerSlice } from "@shared/state/hooks/useCustomerSlice";
import { createSalesTable } from "@/state/salesTable";
import { SalesTable } from "./SalesTable";

export function CustomerSalesPage() {
  const { id = "" } = useParams<{ id: string }>();
  return <CustomerSales key={id} customerId={id} />;
}

// Every branch, like the phone page: this is one customer's whole history.
function CustomerSales({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const customer = useCustomerSlice((s) => s.items.find((c) => c.id === customerId) ?? null);
  const fetchCustomer = useCustomerSlice((s) => s.fetchCustomer);
  const [table] = useState(() => createSalesTable(customerId));
  const markStale = useStore(table, (s) => s.markStale);
  const backLabel = t("web.sales.back_to_customer");

  useOwedChanged(markStale);

  useEffect(() => {
    if (!customer) void fetchCustomer(customerId);
  }, [customer, customerId, fetchCustomer]);

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Tooltip title={backLabel}>
          <IconButton href={`/customers/${customerId}`} aria-label={backLabel}>
            <ArrowBack />
          </IconButton>
        </Tooltip>
        <Typography variant="h5" component="h2" sx={{ fontWeight: 700, minWidth: 0 }} noWrap>
          {customer?.name ?? ""}
        </Typography>
      </Stack>
      <SalesTable table={table} branch={null} customerScoped />
    </Stack>
  );
}
