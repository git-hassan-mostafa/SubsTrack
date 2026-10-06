import { useTranslation } from "react-i18next";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { Service } from "@shared/core/types";
import { matchesOptionSearch } from "@shared/shared/lib/optionSearch";

interface ServicePickerProps {
  value: Service | null;
  customName: string;
  options: Service[];
  onSelect: (service: Service | null) => void;
  onType: (name: string) => void;
  sublabel: (service: Service) => string;
}

// Typed text is a one-off job name, never saved to the price list.
export function ServicePicker({ value, customName, options, onSelect, onType, sublabel }: ServicePickerProps) {
  const { t } = useTranslation();
  const typed = value === null && customName.trim().length > 0;

  const handleTyping = (text: string) => {
    if (value) onSelect(null);
    onType(text);
  };

  return (
    <Autocomplete<Service, false, false, true>
      freeSolo
      size="small"
      fullWidth
      autoHighlight
      value={value}
      inputValue={value?.name ?? customName}
      options={options}
      onChange={(_event, next) => {
        if (next !== null && typeof next !== "string") onSelect(next);
      }}
      onInputChange={(_event, text, reason) => {
        if (reason === "input") handleTyping(text);
        if (reason === "clear") handleTyping("");
      }}
      getOptionLabel={(option) => (typeof option === "string" ? option : option.name)}
      getOptionKey={(option) => (typeof option === "string" ? option : option.id)}
      isOptionEqualToValue={(option, selected) => typeof selected !== "string" && option.id === selected.id}
      getOptionDisabled={(service) => !service.active}
      filterOptions={(all, { inputValue }) =>
        all.filter((service) => matchesOptionSearch(inputValue, service.name, sublabel(service)))
      }
      slotProps={{ popper: { sx: { minWidth: 240 } } }}
      renderOption={({ key, ...props }, service) => (
        <Box component="li" key={key} {...props}>
          <Box>
            <Typography variant="body2">{service.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {sublabel(service)}
            </Typography>
          </Box>
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={t("sales.service_label")}
          placeholder={t("web.sales.service_placeholder")}
          helperText={typed ? t("sales.service_other_hint") : undefined}
          required
        />
      )}
    />
  );
}
