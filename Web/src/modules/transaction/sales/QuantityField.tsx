import { useState } from "react";
import TextField from "@mui/material/TextField";

interface QuantityFieldProps {
  label: string;
  value: number;
  onChange: (quantity: number) => void;
  helperText?: string;
}

// The cart caps the count at the stock left, so the box shows the capped value.
export function QuantityField({ label, value, onChange, helperText }: QuantityFieldProps) {
  const [text, setText] = useState(String(value));
  const typed = text === "" ? null : Number(text);
  if (typed !== null && typed !== value) setText(String(value));

  return (
    <TextField
      label={label}
      value={text}
      size="small"
      required
      helperText={helperText}
      onChange={(event) => {
        const next = event.target.value.replace(/\D/g, "");
        setText(next);
        if (next !== "") onChange(Number(next));
      }}
      onBlur={() => setText(String(value))}
      slotProps={{ htmlInput: { inputMode: "numeric" } }}
      sx={{ width: 110 }}
    />
  );
}
