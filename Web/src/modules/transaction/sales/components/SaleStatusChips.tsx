import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import type { Sale } from "@shared/core/types";
import { saleFacts } from "@shared/modules/transaction/sales/utils/saleView";
import { StatusChip } from "@/shared/components/StatusChip";

// Voided, written off and "no items" are the facts the total alone hides.
export function SaleStatusChips({ sale }: { sale: Sale }) {
  const { t } = useTranslation();
  const facts = saleFacts(sale);
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
      {facts.voided ? (
        <Tooltip title={sale.voidReason ?? ""}>
          <span>
            <StatusChip label={t("sales.voided")} tone="red" />
          </span>
        </Tooltip>
      ) : facts.fullyPaid ? (
        <StatusChip label={t("web.bill.paid_in_full")} tone="emerald" />
      ) : sale.amountPaid > 0 ? (
        <StatusChip label={t("web.customer_detail.part_paid")} tone="amber" />
      ) : (
        <StatusChip label={t("web.bill.label_open")} tone="red" />
      )}
      {facts.writtenOff ? <StatusChip label={t("ledger.written_off")} tone="orange" /> : null}
      {!facts.voided && sale.items.length === 0 ? <StatusChip label={t("sales.no_items_chip")} tone="violet" /> : null}
    </Stack>
  );
}
