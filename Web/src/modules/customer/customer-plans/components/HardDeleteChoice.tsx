import { useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Typography from "@mui/material/Typography";

interface HardDeleteChoiceProps {
  onChange: (hardDelete: boolean) => void;
}

// Unticked = cancel the line and keep its payments; ticked = delete, no undo.
export function HardDeleteChoice({ onChange }: HardDeleteChoiceProps) {
  const { t } = useTranslation();
  const [checked, setChecked] = useState(false);

  return (
    <FormControlLabel
      sx={{ alignItems: "flex-start", mt: 2, mx: 0 }}
      control={
        <Checkbox
          color="error"
          checked={checked}
          onChange={(event) => {
            setChecked(event.target.checked);
            onChange(event.target.checked);
          }}
          sx={{ mt: -0.75 }}
        />
      }
      label={
        <Box>
          <Typography sx={{ fontWeight: 600, color: "error.main" }}>
            {t("subscriptions.delete_permanently_label")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("subscriptions.delete_permanently_hint")}
          </Typography>
        </Box>
      }
    />
  );
}
