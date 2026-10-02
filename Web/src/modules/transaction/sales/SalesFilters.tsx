import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import {
  SALE_STATUS_LABEL_KEYS,
  type SaleFilterChoice,
  type SaleStatus,
} from "@shared/modules/transaction/sales/utils/saleFilters";
import { useProductSlice } from "@shared/state/hooks/useProductSlice";
import { DateField } from "@/shared/components/DateField";
import { FilterSelect } from "@/shared/table/FilterSelect";

interface SalesFiltersProps {
  value: SaleFilterChoice;
  onChange: (next: Partial<SaleFilterChoice>) => void;
}

const DATE_WIDTH = 180;

const STATUSES = Object.keys(SALE_STATUS_LABEL_KEYS) as SaleStatus[];

// The phone's filter chips as fields; empty dates mean every sale ever.
export function SalesFilters({ value, onChange }: SalesFiltersProps) {
  const { t } = useTranslation();
  const products = useProductSlice((s) => s.items);
  const getProducts = useProductSlice((s) => s.getProducts);

  useEffect(() => {
    void getProducts();
  }, [getProducts]);

  return (
    <>
      <FilterSelect<string | null>
        label={t("sales.filter_by_product")}
        anyLabel={t("sales.all_products")}
        value={value.productId}
        onChange={(productId) => onChange({ productId })}
        options={products
          .filter((product) => product.active)
          .map((product) => ({ value: product.id, label: product.name }))}
      />
      <Box sx={{ width: DATE_WIDTH }}>
        <DateField
          label={t("sales.date_from")}
          value={value.fromDate ?? ""}
          maxDate={value.toDate ?? undefined}
          onChange={(fromDate) => onChange({ fromDate: fromDate || null })}
          clearable
          size="small"
        />
      </Box>
      <Box sx={{ width: DATE_WIDTH }}>
        <DateField
          label={t("sales.date_to")}
          value={value.toDate ?? ""}
          minDate={value.fromDate ?? undefined}
          onChange={(toDate) => onChange({ toDate: toDate || null })}
          clearable
          size="small"
        />
      </Box>
      <FilterSelect<SaleStatus>
        label={t("sales.filter_by_status")}
        value={value.status}
        onChange={(status) => onChange({ status })}
        options={STATUSES.map((status) => ({ value: status, label: t(SALE_STATUS_LABEL_KEYS[status]) }))}
      />
    </>
  );
}
