import { useState } from "react";
import TextField, { type TextFieldProps } from "@mui/material/TextField";
import { amountText, decimalDigitsOnly, parseAmount } from "@shared/core/utils/inputText";

type AmountFieldProps = Omit<TextFieldProps, "value" | "onChange" | "slotProps"> & {
  value: number | null;
  onChange: (value: number | null) => void;
};

// Keeps a half-typed "12." on screen; a new value from outside replaces the text.
export function AmountField({ value, onChange, ...props }: AmountFieldProps) {
  const [text, setText] = useState(amountText(value));

  if (parseAmount(text) !== value) setText(amountText(value));

  return (
    <TextField
      {...props}
      value={text}
      onChange={(event) => {
        const next = decimalDigitsOnly(event.target.value);
        setText(next);
        onChange(parseAmount(next));
      }}
      slotProps={{ htmlInput: { inputMode: "decimal" } }}
    />
  );
}
