import { type NullOption, SearchableSelect } from "@/shared/components/SearchableSelect";

interface CatalogPickerProps<T extends { id: string; name: string }> {
  label: string;
  value: T | null;
  options: T[];
  onChange: (item: T | null) => void;
  sublabel: (item: T) => string;
  optionDisabled?: (item: T) => boolean;
  nullOption?: NullOption;
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
  nullOption,
  placeholder,
  required = false,
}: CatalogPickerProps<T>) {
  return (
    <SearchableSelect<string>
      size="small"
      label={label}
      value={value?.id ?? null}
      onChange={(id) => onChange(options.find((item) => item.id === id) ?? null)}
      options={options.map((item) => ({
        value: item.id,
        label: item.name,
        sublabel: sublabel(item),
        disabled: optionDisabled?.(item),
      }))}
      nullOption={nullOption}
      placeholder={placeholder}
      required={required}
      fullWidth
    />
  );
}
