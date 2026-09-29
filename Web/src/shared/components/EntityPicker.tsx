import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useDebounce } from "@shared/shared/hooks/useDebounce";

export interface EntityOption {
  label: string;
  sublabel?: string;
}

interface SearchResult<T> {
  term: string | null;
  options: T[];
  error: string | null;
}

const NO_RESULT: SearchResult<never> = { term: null, options: [], error: null };

interface EntityPickerProps<T> {
  label: string;
  value: T | null;
  onChange: (item: T | null) => void;
  search: (term: string) => Promise<T[]>;
  describe: (item: T) => EntityOption;
  getKey: (item: T) => string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string | null;
}

// For lists too big to hold: the server does the matching, the box never filters.
export function EntityPicker<T>({
  label,
  value,
  onChange,
  search,
  describe,
  getKey,
  placeholder,
  disabled = false,
  required = false,
  error,
}: EntityPickerProps<T>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<SearchResult<T>>(NO_RESULT);
  const term = useDebounce(text.trim(), 300);
  const loading = open && result.term !== term;
  const { options, error: loadError } = result;

  useEffect(() => {
    if (!open) return;
    let active = true;
    search(term).then(
      (found) => {
        if (active) setResult({ term, options: found, error: null });
      },
      (e: Error) => {
        if (active) setResult({ term, options: [], error: e.message });
      },
    );
    return () => {
      active = false;
    };
  }, [open, term, search]);

  const shown = value && !options.some((o) => getKey(o) === getKey(value))
    ? [value, ...options]
    : options;

  return (
    <Autocomplete<T>
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      value={value}
      onChange={(_event, next) => onChange(next)}
      onInputChange={(_event, next, reason) => {
        if (reason === "input" || reason === "clear") setText(next);
      }}
      options={shown}
      filterOptions={(all) => all}
      getOptionLabel={(item) => describe(item).label}
      isOptionEqualToValue={(a, b) => getKey(a) === getKey(b)}
      getOptionKey={getKey}
      loading={loading}
      loadingText={t("web.loading")}
      noOptionsText={loadError ?? t("common.no_results")}
      disabled={disabled}
      renderOption={({ key, ...props }, item) => {
        const option = describe(item);
        return (
          <Box component="li" key={key} {...props}>
            <Box>
              <Typography variant="body2">{option.label}</Typography>
              {option.sublabel ? (
                <Typography variant="caption" color="text.secondary">
                  {option.sublabel}
                </Typography>
              ) : null}
            </Box>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          required={required}
          error={Boolean(error)}
          helperText={error ?? undefined}
        />
      )}
    />
  );
}
