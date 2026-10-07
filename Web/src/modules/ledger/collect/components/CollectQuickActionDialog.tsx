import { useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import type { Collection, Customer } from "@shared/core/types";
import { useCustomerOwed } from "@shared/modules/ledger/hooks/useCustomerOwed";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";
import { FormDialog } from "@/shared/components/FormDialog";
import { CustomerPicker } from "@/modules/customer/customers/components/CustomerPicker";
import { CollectDialog } from "./CollectDialog";

interface CollectQuickActionDialogProps {
  onClose: () => void;
  onCollected: (collections: Collection[]) => void;
}

// Pick a customer; everything they owe is poured over oldest-first by the waterfall.
export function CollectQuickActionDialog({ onClose, onCollected }: CollectQuickActionDialogProps) {
  const { t } = useTranslation();
  const error = useLedgerSlice((s) => s.error);
  const clearError = useLedgerSlice((s) => s.clearError);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [tried, setTried] = useState(false);
  const { loading, owed, failed, nothingOwed } = useCustomerOwed(customer);

  const picker = (
    <CustomerPicker
      label={t("debts.customer_label")}
      placeholder={t("debts.pick_customer")}
      value={customer}
      onChange={(next) => {
        setTried(false);
        setCustomer(next);
      }}
      required
    />
  );

  if (customer && owed.length > 0) {
    return (
      <CollectDialog
        key={customer.id}
        target={{ customerId: customer.id, customerName: customer.name, items: owed, single: false }}
        header={picker}
        onClose={onClose}
        onCollected={onCollected}
      />
    );
  }

  const blocker = tried && !customer ? t("web.collect.pick_customer") : null;
  return (
    <FormDialog
      open
      title={t("ledger.collect_money")}
      onClose={onClose}
      onSubmit={() => setTried(true)}
      error={blocker ?? (failed ? error : null)}
      onDismissError={() => {
        setTried(false);
        clearError();
      }}
    >
      {picker}
      {loading ? (
        <Box sx={{ py: 2 }}>
          <LinearProgress aria-label={t("web.loading")} />
        </Box>
      ) : null}
      {nothingOwed ? (
        <Typography color="text.secondary" sx={{ textAlign: "center", py: 2 }}>
          {t("ledger.nothing_owed")}
        </Typography>
      ) : null}
    </FormDialog>
  );
}
