import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";
import { matchesOptionSearch } from "@shared/shared/lib/optionSearch";
import { type SelectAddNew, SelectAddNewPaper } from "./SelectAddNewPaper";

const NULL_KEY = "__null__";

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

export interface NullOption {
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

interface Row<T> {
  value: T | null;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

interface SearchableSelectProps<T extends string | number> {
  value: T | null;
  onChange: (value: T | null) => void;
  options: SelectOption<T>[];
  label?: string;
  ariaLabel?: string;
  nullOption?: NullOption;
  addNew?: SelectAddNew;
  placeholder?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  size?: "small" | "medium";
  fullWidth?: boolean;
  startAdornment?: ReactNode;
  sx?: SxProps<Theme>;
}

// For held lists; null is its own row, never a clear button.
export function SearchableSelect<T extends string | number>({
  value,
  onChange,
  options,
  label,
  ariaLabel,
  nullOption,
  addNew,
  placeholder,
  helperText,
  required = false,
  disabled = false,
  size = "medium",
  fullWidth = false,
  startAdornment,
  sx,
}: SearchableSelectProps<T>) {
  const { t } = useTranslation();
  const rows: Row<T>[] = nullOption ? [{ ...nullOption, value: null }, ...options] : options;
  const selected = rows.find((row) => row.value === value) ?? null;

  return (
    <Autocomplete<Row<T>, false, boolean, false>
      value={selected}
      options={rows}
      onChange={(_event, next) => {
        if (next) onChange(next.value);
      }}
      getOptionLabel={(row) => row.label}
      getOptionKey={(row) => String(row.value ?? NULL_KEY)}
      isOptionEqualToValue={(a, b) => a.value === b.value}
      getOptionDisabled={(row) => Boolean(row.disabled)}
      filterOptions={(all, { inputValue }) =>
        all.filter((row) => matchesOptionSearch(inputValue, row.label, row.sublabel))
      }
      disableClearable
      autoHighlight
      noOptionsText={t("common.no_results")}
      disabled={disabled}
      size={size}
      fullWidth={fullWidth}
      sx={sx}
      slots={addNew ? { paper: SelectAddNewPaper } : undefined}
      slotProps={{
        popper: { sx: { minWidth: 240 } },
        paper: addNew ? { addNew } : undefined,
      }}
      renderOption={({ key, ...props }, row) => (
        <Box component="li" key={key} {...props}>
          <Box>
            <Typography variant="body2">{row.label}</Typography>
            {row.sublabel ? (
              <Typography variant="caption" color="text.secondary">
                {row.sublabel}
              </Typography>
            ) : null}
          </Box>
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          helperText={helperText}
          required={required}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              startAdornment: startAdornment ?? params.slotProps.input.startAdornment,
            },
            htmlInput: ariaLabel
              ? { ...params.slotProps.htmlInput, "aria-label": ariaLabel }
              : params.slotProps.htmlInput,
          }}
        />
      )}
    />
  );
}
