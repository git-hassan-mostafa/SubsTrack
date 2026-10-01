import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import type { Customer, CustomerStatus } from "@shared/core/types";
import {
  customerPills,
  type CustomerPill,
} from "@shared/modules/customer/customers/utils/customerPills";
import type { ChipTone } from "@/shared/components/chipTones";
import { StatusChip } from "@/shared/components/StatusChip";

type StatusPill = Exclude<CustomerPill, "debt">;

const PILL_STYLES: Record<
  StatusPill,
  { label: (t: TFunction, status: CustomerStatus | null) => string; tone: ChipTone }
> = {
  inactive: { label: (t) => t("common.inactive"), tone: "gray" },
  non_regular: { label: (t) => t("customers.non_regular"), tone: "indigo" },
  paid: { label: (t) => t("common.paid"), tone: "emerald" },
  mixed: {
    label: (t, status) =>
      t("customers.plans_paid_count", {
        paid: status?.planCount.paid ?? 0,
        total: status?.planCount.total ?? 0,
      }),
    tone: "amber",
  },
  unpaid: { label: (t) => t("dashboard.unpaid"), tone: "red" },
  skipped: { label: (t) => t("payments.skip.skipped_label"), tone: "gray" },
  not_due_yet: { label: (t) => t("payments.not_due_yet_label"), tone: "sky" },
  overdue: { label: (t) => t("customers.overdue"), tone: "red" },
};

interface CustomerPillsProps {
  customer: Customer;
  status: CustomerStatus | null;
}

// The phone card's pills; the debt amount has its own column here.
export function CustomerPills({ customer, status }: CustomerPillsProps) {
  const { t } = useTranslation();
  const pills = customerPills(customer, status, false).filter(
    (pill): pill is StatusPill => pill !== "debt",
  );

  return (
    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
      {pills.map((pill) => (
        <StatusChip key={pill} label={PILL_STYLES[pill].label(t, status)} tone={PILL_STYLES[pill].tone} />
      ))}
    </Stack>
  );
}
