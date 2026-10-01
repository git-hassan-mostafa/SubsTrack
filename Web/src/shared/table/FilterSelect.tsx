import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";

const ANY = "";

export interface FilterOption<T extends string | number> {
  value: T;
  label: string;
}

interface FilterSelectProps<T extends string | number | null> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: FilterOption<NonNullable<T>>[];
  anyLabel?: string;
  minWidth?: number;
}

// `anyLabel` adds a first row that sets the value back to null — T must allow it.
export function FilterSelect<T extends string | number | null>({
  label,
  value,
  onChange,
  options,
  anyLabel,
  minWidth = 160,
}: FilterSelectProps<T>) {
  const pick = (raw: unknown) => {
    const picked = options.find((option) => String(option.value) === String(raw));
    onChange((picked ? picked.value : null) as T);
  };

  return (
    <TextField
      select
      size="small"
      label={label}
      value={value ?? ANY}
      onChange={(event) => pick(event.target.value)}
      sx={{ minWidth }}
    >
      {anyLabel !== undefined ? <MenuItem value={ANY}>{anyLabel}</MenuItem> : null}
      {options.map((option) => (
        <MenuItem key={String(option.value)} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
}
