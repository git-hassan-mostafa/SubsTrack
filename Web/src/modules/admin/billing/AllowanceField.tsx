import { useState } from "react";
import { useTranslation } from "react-i18next";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { digitsOnly, signedDigitsOnly } from "@shared/core/utils/inputText";
import { signedText } from "@shared/modules/admin/billing/utils/allowanceChange";

interface AllowanceFieldProps {
  label: string;
  current: number;
  value: number;
  floor: number;
  error: string | null;
  onChange: (next: number) => void;
}

// A typed box keeps its text only while it still means the number held.
function heldText(text: string, value: number, format: (value: number) => string): string {
  return (Number(text) || 0) === value ? text : format(value);
}

// The new total beside a signed change; both edit the same number.
export function AllowanceField({ label, current, value, floor, error, onChange }: AllowanceFieldProps) {
  const { t } = useTranslation();
  const [totalText, setTotalText] = useState(String(value));
  const [deltaText, setDeltaText] = useState(signedText(value - current));
  const delta = value - current;
  const atFloor = value <= floor;
  const clamp = (next: number) => Math.max(floor, next);

  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
      <TextField
        label={label}
        value={heldText(totalText, value, String)}
        onChange={(event) => {
          const text = digitsOnly(event.target.value).slice(0, 6);
          setTotalText(text);
          onChange(Number(text) || 0);
        }}
        error={!!error}
        helperText={error}
        slotProps={{ htmlInput: { inputMode: "numeric" } }}
        sx={{ flex: 1 }}
      />
      <TextField
        label={t("billing.change_label")}
        value={heldText(deltaText, delta, signedText)}
        placeholder="0"
        onChange={(event) => {
          const text = signedDigitsOnly(event.target.value).slice(0, 7);
          setDeltaText(text);
          onChange(clamp(current + (Number(text) || 0)));
        }}
        slotProps={{
          htmlInput: { inputMode: "numeric", style: { textAlign: "center" } },
          input: {
            sx: { color: delta > 0 ? "success.main" : delta < 0 ? "error.main" : undefined },
            startAdornment: (
              <InputAdornment position="start">
                <IconButton
                  aria-label={t("web.organization.decrease")}
                  disabled={atFloor}
                  onClick={() => onChange(clamp(value - 1))}
                  edge="start"
                >
                  <RemoveIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  aria-label={t("web.organization.increase")}
                  onClick={() => onChange(value + 1)}
                  edge="end"
                >
                  <AddIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
        sx={{ flex: 1 }}
      />
    </Stack>
  );
}
