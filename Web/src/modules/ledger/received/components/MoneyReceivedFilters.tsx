import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { WalletSource } from "@shared/core/types";
import { labelledOptions } from "@shared/core/utils/labelledOptions";
import type {
  CollectionSortField,
  SortDirection,
} from "@shared/modules/ledger/repository/ICollectionRepository";
import {
  COLLECTION_KINDS,
  COLLECTION_SORT_LABEL_KEYS,
  COLLECTION_STATUS_LABEL_KEYS,
  SORT_DIRECTION_LABEL_KEYS,
  type CollectionFilterChoice,
  type CollectionStatus,
} from "@shared/modules/ledger/utils/collectionFilters";
import { useUserSlice } from "@shared/state/hooks/useUserSlice";
import { PeriodPicker } from "@/shared/components/PeriodPicker";
import { FilterSelect } from "@/shared/table/FilterSelect";

interface MoneyReceivedFiltersProps {
  value: CollectionFilterChoice;
  onChange: (next: Partial<CollectionFilterChoice>) => void;
}

// The phone's filter chips as selects; the table's filter bar scrolls them sideways.
export function MoneyReceivedFilters({ value, onChange }: MoneyReceivedFiltersProps) {
  const { t } = useTranslation();
  const users = useUserSlice((s) => s.items);
  const getUsers = useUserSlice((s) => s.getUsers);

  useEffect(() => {
    void getUsers();
  }, [getUsers]);

  return (
    <>
      <PeriodPicker value={value.period} onChange={(period) => onChange({ period })} />
      <FilterSelect<string | null>
        label={t("payments.filter_by_user")}
        anyLabel={t("payments.all_users")}
        value={value.receivedByUserId}
        onChange={(receivedByUserId) => onChange({ receivedByUserId })}
        options={users.map((user) => ({ value: user.id, label: user.fullName }))}
        searchable
      />
      <FilterSelect<WalletSource | null>
        label={t("ledger.filter_by_type")}
        anyLabel={t("ledger.all_types")}
        value={value.kind}
        onChange={(kind) => onChange({ kind })}
        options={COLLECTION_KINDS.map((kind) => ({ value: kind, label: t(`ledger.kind_${kind}`) }))}
        minWidth={140}
      />
      <FilterSelect<CollectionStatus | null>
        label={t("ledger.filter_by_status")}
        anyLabel={t("ledger.all_statuses")}
        value={value.status}
        onChange={(status) => onChange({ status })}
        options={labelledOptions(COLLECTION_STATUS_LABEL_KEYS, t)}
      />
      <FilterSelect<CollectionSortField>
        label={t("ledger.sort_by_label")}
        value={value.sortField}
        onChange={(sortField) => onChange({ sortField })}
        options={labelledOptions(COLLECTION_SORT_LABEL_KEYS, t)}
      />
      <FilterSelect<SortDirection>
        label={t("ledger.sort_label")}
        value={value.sortDirection}
        onChange={(sortDirection) => onChange({ sortDirection })}
        options={labelledOptions(SORT_DIRECTION_LABEL_KEYS, t)}
        minWidth={140}
      />
    </>
  );
}
