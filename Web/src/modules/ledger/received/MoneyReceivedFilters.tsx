import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import type { WalletSource } from "@shared/core/types";
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

const ALL = "";

interface MoneyReceivedFiltersProps {
  value: CollectionFilterChoice;
  onChange: (next: Partial<CollectionFilterChoice>) => void;
}

function keysOf<K extends string>(labels: Record<K, string>): K[] {
  return Object.keys(labels) as K[];
}

// The phone's filter chips as one wrapping row of selects.
export function MoneyReceivedFilters({ value, onChange }: MoneyReceivedFiltersProps) {
  const { t } = useTranslation();
  const users = useUserSlice((s) => s.items);
  const getUsers = useUserSlice((s) => s.getUsers);

  useEffect(() => {
    void getUsers();
  }, [getUsers]);

  return (
    <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
      <PeriodPicker value={value.period} onChange={(period) => onChange({ period })} />
      <TextField
        select
        size="small"
        label={t("payments.filter_by_user")}
        value={value.receivedByUserId ?? ALL}
        onChange={(event) => onChange({ receivedByUserId: event.target.value || null })}
        sx={{ minWidth: 160 }}
      >
        <MenuItem value={ALL}>{t("payments.all_users")}</MenuItem>
        {users.map((user) => (
          <MenuItem key={user.id} value={user.id}>
            {user.fullName}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        label={t("ledger.filter_by_type")}
        value={value.kind ?? ALL}
        onChange={(event) => onChange({ kind: (event.target.value || null) as WalletSource | null })}
        sx={{ minWidth: 140 }}
      >
        <MenuItem value={ALL}>{t("ledger.all_types")}</MenuItem>
        {COLLECTION_KINDS.map((kind) => (
          <MenuItem key={kind} value={kind}>
            {t(`ledger.kind_${kind}`)}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        label={t("ledger.filter_by_status")}
        value={value.status ?? ALL}
        onChange={(event) =>
          onChange({ status: (event.target.value || null) as CollectionStatus | null })
        }
        sx={{ minWidth: 160 }}
      >
        <MenuItem value={ALL}>{t("ledger.all_statuses")}</MenuItem>
        {keysOf(COLLECTION_STATUS_LABEL_KEYS).map((status) => (
          <MenuItem key={status} value={status}>
            {t(COLLECTION_STATUS_LABEL_KEYS[status])}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        label={t("ledger.sort_by_label")}
        value={value.sortField}
        onChange={(event) => onChange({ sortField: event.target.value as CollectionSortField })}
        sx={{ minWidth: 160 }}
      >
        {keysOf(COLLECTION_SORT_LABEL_KEYS).map((field) => (
          <MenuItem key={field} value={field}>
            {t(COLLECTION_SORT_LABEL_KEYS[field])}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        label={t("ledger.sort_label")}
        value={value.sortDirection}
        onChange={(event) => onChange({ sortDirection: event.target.value as SortDirection })}
        sx={{ minWidth: 140 }}
      >
        {keysOf(SORT_DIRECTION_LABEL_KEYS).map((direction) => (
          <MenuItem key={direction} value={direction}>
            {t(SORT_DIRECTION_LABEL_KEYS[direction])}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  );
}
