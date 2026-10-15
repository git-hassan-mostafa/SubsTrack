import type { ReactNode } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { fieldTextWidth } from "@/shared/components/fieldTextWidth";
import type { FilterOption } from "./FilterSelect";

const ALL_KEY = "__all__";

export interface MultiFilterSelectProps<T extends string | number> {
  label: string;
  value: readonly T[];
  onChange: (value: T[]) => void;
  options: FilterOption<T>[];
  allLabel?: string;
  minWidth?: number;
  searchable?: boolean;
}

type OptionRow<T> = { type: "option"; value: T; label: string };
type AutocompleteRow<T> = { type: "all"; label: string } | OptionRow<T>;

// "All" is a pseudo-option that resets the filter to an empty list.
export function MultiFilterSelect<T extends string | number>({
  label,
  value,
  onChange,
  options,
  allLabel,
  minWidth = 160,
  searchable = false,
}: MultiFilterSelectProps<T>) {
  if (searchable) {
    const allRow: AutocompleteRow<T>[] =
      allLabel !== undefined ? [{ type: "all", label: allLabel }] : [];
    const itemRows: OptionRow<T>[] = options.map((opt) => ({
      type: "option",
      value: opt.value,
      label: opt.label,
    }));
    const fullOptions: AutocompleteRow<T>[] = [...allRow, ...itemRows];
    const selectedOptions = itemRows.filter((row) =>
      value.some((v) => String(v) === String(row.value)),
    );
    return (
      <Autocomplete<AutocompleteRow<T>, true, false, false>
        multiple
        size="small"
        options={fullOptions}
        value={selectedOptions}
        onChange={(_event, next) => {
          if (next.some((opt) => opt.type === "all")) {
            onChange([]);
            return;
          }
          const chosen = next.filter(
            (opt): opt is OptionRow<T> => opt.type === "option",
          );
          onChange(chosen.map((opt) => opt.value));
        }}
        getOptionLabel={(opt) => opt.label}
        isOptionEqualToValue={(a, b) =>
          a.type === "all" || b.type === "all"
            ? a.type === b.type
            : String(a.value) === String(b.value)
        }
        disableCloseOnSelect
        renderValue={(selectedValues) => {
          if (!selectedValues || selectedValues.length === 0) return null;
          const text =
            selectedValues.length <= 2
              ? selectedValues.map((opt) => opt.label).join(", ")
              : `${selectedValues.slice(0, 2).map((opt) => opt.label).join(", ")} (+${selectedValues.length - 2})`;
          return (
            <Typography
              variant="body2"
              sx={{
                mx: 0.5,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 180,
              }}
            >
              {text}
            </Typography>
          );
        }}
        renderOption={(props, option, { selected }) => {
          const { key, ...rest } = props;
          return (
            <Box component="li" key={key} {...rest}>
              {option.type === "all" ? null : (
                <Checkbox size="small" checked={selected} sx={{ mr: 1, p: 0.25 }} />
              )}
              <ListItemText primary={option.label} />
            </Box>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            placeholder={value.length === 0 ? allLabel : undefined}
            slotProps={{
              ...params.slotProps,
              inputLabel: { ...params.slotProps?.inputLabel, shrink: true },
              htmlInput: {
                ...params.slotProps?.htmlInput,
                style: { minWidth: fieldTextWidth(label, []) },
              },
            }}
          />
        )}
        sx={{ minWidth }}
      />
    );
  }

  const renderDisplay = (selected: unknown): ReactNode => {
    const arr = (selected as T[]) || value;
    if (!arr || arr.length === 0) {
      return allLabel ? (
        <Typography component="span" variant="body2" sx={{ color: "text.secondary" }}>
          {allLabel}
        </Typography>
      ) : (
        ""
      );
    }
    const labels = arr.map(
      (item) => options.find((opt) => String(opt.value) === String(item))?.label ?? String(item),
    );
    if (labels.length <= 2) return labels.join(", ");
    return `${labels.slice(0, 2).join(", ")} (+${labels.length - 2})`;
  };

  return (
    <TextField
      select
      size="small"
      label={label}
      value={value as T[]}
      onChange={(event) => {
        const raw = event.target.value;
        const picked = typeof raw === "string" ? raw.split(",") : (raw as (T | typeof ALL_KEY)[]);
        if (picked.includes(ALL_KEY)) {
          onChange([]);
          return;
        }
        const clean = picked.map((item) => {
          const match = options.find((opt) => String(opt.value) === String(item));
          return match ? match.value : (item as T);
        });
        onChange(clean);
      }}
      slotProps={{
        inputLabel: { shrink: true },
        select: {
          multiple: true,
          displayEmpty: Boolean(allLabel),
          renderValue: renderDisplay,
        },
      }}
      sx={{ minWidth, "& .MuiSelect-select": { minWidth: fieldTextWidth(label, []) } }}
    >
      {allLabel !== undefined ? (
        <MenuItem value={ALL_KEY}>
          <ListItemText primary={allLabel} />
        </MenuItem>
      ) : null}
      {options.map((option) => {
        const checked = value.some((v) => String(v) === String(option.value));
        return (
          <MenuItem key={String(option.value)} value={option.value}>
            <Checkbox size="small" checked={checked} sx={{ mr: 1, p: 0.25 }} />
            <ListItemText primary={option.label} />
          </MenuItem>
        );
      })}
    </TextField>
  );
}
