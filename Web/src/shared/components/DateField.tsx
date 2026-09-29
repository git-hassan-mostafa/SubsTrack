import dayjs, { type Dayjs } from "dayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";

const DAY_FORMAT = "YYYY-MM-DD";
const DAY_TIME_FORMAT = "YYYY-MM-DD HH:mm";

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minDate?: string;
  maxDate?: string;
  showTime?: boolean;
  monthOnly?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  required?: boolean;
  error?: string | null;
}

function toDayjs(value: string | undefined): Dayjs | null {
  if (!value) return null;
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed : null;
}

// Speaks the phone picker's strings: "YYYY-MM-DD", "YYYY-MM-DD HH:mm" or "".
export function DateField({
  label,
  value,
  onChange,
  minDate,
  maxDate,
  showTime = false,
  monthOnly = false,
  clearable = false,
  disabled = false,
  required = false,
  error,
}: DateFieldProps) {
  const withTime = showTime && !monthOnly;

  const handleChange = (next: Dayjs | null) => {
    if (!next) {
      onChange("");
      return;
    }
    if (!next.isValid()) return;
    if (monthOnly) onChange(next.startOf("month").format(DAY_FORMAT));
    else onChange(next.format(withTime ? DAY_TIME_FORMAT : DAY_FORMAT));
  };

  const common = {
    label,
    value: toDayjs(value),
    onChange: handleChange,
    minDate: toDayjs(minDate) ?? undefined,
    maxDate: toDayjs(maxDate) ?? undefined,
    disabled,
    slotProps: {
      field: { clearable },
      textField: {
        fullWidth: true,
        required,
        error: Boolean(error),
        helperText: error ?? undefined,
      },
    },
  };

  if (withTime) return <DateTimePicker {...common} ampm={false} />;
  return (
    <DatePicker
      {...common}
      views={monthOnly ? ["month", "year"] : undefined}
      openTo={monthOnly ? "month" : undefined}
    />
  );
}
