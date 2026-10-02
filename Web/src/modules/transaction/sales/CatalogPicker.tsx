import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

interface CatalogPickerProps<T extends { id: string; name: string }> {
  label: string;
  value: T | null;
  options: T[];
  onChange: (item: T | null) => void;
  sublabel: (item: T) => string;
  optionDisabled?: (item: T) => boolean;
  placeholder?: string;
  required?: boolean;
}

// The catalog is already held in the store, so the box filters it locally.
export function CatalogPicker<T extends { id: string; name: string }>({
  label,
  value,
  options,
  onChange,
  sublabel,
  optionDisabled,
  placeholder,
  required = false,
}: CatalogPickerProps<T>) {
  const { t } = useTranslation();
  return (
    <Autocomplete<T>
      value={value}
      options={options}
      onChange={(_event, next) => onChange(next)}
      getOptionLabel={(item) => item.name}
      getOptionKey={(item) => item.id}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      getOptionDisabled={optionDisabled}
      noOptionsText={t("common.no_results")}
      size="small"
      fullWidth
      renderOption={({ key, ...props }, item) => (
        <Box component="li" key={key} {...props}>
          <Box>
            <Typography variant="body2">{item.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {sublabel(item)}
            </Typography>
          </Box>
        </Box>
      )}
      renderInput={(params) => (
        <TextField {...params} label={label} placeholder={placeholder} required={required} />
      )}
    />
  );
}
