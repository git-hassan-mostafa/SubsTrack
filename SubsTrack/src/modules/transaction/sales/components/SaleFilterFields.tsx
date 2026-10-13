import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Dropdown,
  type DropdownOption,
} from "@/src/shared/components/Dropdown";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { FilterRow } from "@/src/shared/components/FilterRow";
import { CustomerPicker } from "@/src/modules/customer/customers";
import { useSaleSlice } from "@shared/state/hooks/useSaleSlice";
import { useProductSlice } from "@shared/state/hooks/useProductSlice";
import {
  SALE_STATUS_LABEL_KEYS,
  type SaleStatus,
} from "@shared/modules/transaction/sales/utils/saleFilters";

export function SaleFilterFields() {
  const { t } = useTranslation();
  const customerFilter = useSaleSlice((s) => s.customerFilter);
  const setCustomerFilter = useSaleSlice((s) => s.setCustomerFilter);
  const productFilter = useSaleSlice((s) => s.productFilter);
  const setProductFilter = useSaleSlice((s) => s.setProductFilter);
  const fromDate = useSaleSlice((s) => s.fromDate);
  const toDate = useSaleSlice((s) => s.toDate);
  const setDateRange = useSaleSlice((s) => s.setDateRange);
  const status = useSaleSlice((s) => s.status);
  const setStatus = useSaleSlice((s) => s.setStatus);
  const products = useProductSlice((s) => s.items);
  const getProducts = useProductSlice((s) => s.getProducts);

  useEffect(() => {
    void getProducts();
  }, [getProducts]);

  const productOptions: DropdownOption<string>[] = useMemo(
    () =>
      products
        .filter((p) => p.active)
        .map((p) => ({ label: p.name, value: p.id })),
    [products],
  );

  const statusOptions: DropdownOption<SaleStatus>[] = useMemo(
    () => [
      { label: t(SALE_STATUS_LABEL_KEYS.voided), value: "voided" },
      { label: t(SALE_STATUS_LABEL_KEYS.all), value: "all" },
    ],
    [t],
  );

  return (
    <>
      <FilterRow label={t("sales.filter_by_customer")}>
        <CustomerPicker
          label={t("sales.filter_by_customer")}
          value={customerFilter}
          onChange={setCustomerFilter}
          nullable
          nullLabel={t("sales.all_customers")}
          triggerStyle="filter"
        />
      </FilterRow>
      <FilterRow label={t("sales.filter_by_product")}>
        <Dropdown<string>
          label={t("sales.filter_by_product")}
          options={productOptions}
          value={productFilter?.id ?? null}
          onChange={(id) =>
            setProductFilter(products.find((p) => p.id === id) ?? null)
          }
          nullable
          nullLabel={t("sales.all_products")}
          triggerStyle="filter"
          searchable
        />
      </FilterRow>
      <FilterRow label={t("filters.date")}>
        <DatePickerInput
          label={t("filters.from")}
          value={fromDate ?? ""}
          onChange={(v) => setDateRange(v || null, toDate)}
          maxDate={toDate ?? undefined}
          triggerStyle="filter"
          clearable
        />
        <DatePickerInput
          label={t("filters.to")}
          value={toDate ?? ""}
          onChange={(v) => setDateRange(fromDate, v || null)}
          minDate={fromDate ?? undefined}
          triggerStyle="filter"
          clearable
        />
      </FilterRow>
      <FilterRow label={t("sales.filter_by_status")}>
        <Dropdown<SaleStatus>
          label={t("sales.filter_by_status")}
          options={statusOptions}
          value={status === "live" ? null : status}
          onChange={(v) => setStatus(v ?? "live")}
          nullable
          nullLabel={t(SALE_STATUS_LABEL_KEYS.live)}
          triggerStyle="filter"
        />
      </FilterRow>
    </>
  );
}
