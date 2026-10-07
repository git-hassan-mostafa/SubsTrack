import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import { SearchField } from "@/shared/components/SearchField";
import { FilterBar } from "./FilterBar";

export interface TableSearch {
  value: string;
  onSearch: (term: string) => void;
  placeholder?: string;
}

export interface TableAdd {
  label: string;
  onClick: () => void;
}

interface TableToolbarProps {
  search?: TableSearch;
  filters?: ReactNode;
  tools?: ReactNode;
  add?: TableAdd;
  loading?: boolean;
  onReload?: () => void;
}

// Goes right above the grid; the tools keep the row's end (left in Arabic).
export function TableToolbar({ search, filters, tools, add, loading = false, onReload }: TableToolbarProps) {
  const { t } = useTranslation();
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1.5}
      sx={{ alignItems: { sm: "center" }, minHeight: 56, minWidth: 0 }}
    >
      {search ? (
        <SearchField value={search.value} onSearch={search.onSearch} placeholder={search.placeholder} />
      ) : null}
      {filters ? <FilterBar>{filters}</FilterBar> : <Box sx={{ flexGrow: 1 }} />}
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", alignSelf: { xs: "flex-end", sm: "center" }, flexShrink: 0 }}
      >
        {onReload ? (
          <Tooltip title={t("web.table.refresh")}>
            <span>
              <IconButton aria-label={t("web.table.refresh")} disabled={loading} onClick={onReload}>
                <RefreshIcon />
              </IconButton>
            </span>
          </Tooltip>
        ) : null}
        {tools}
        {add ? (
          <Button variant="contained" startIcon={<AddIcon />} onClick={add.onClick}>
            {add.label}
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
}
