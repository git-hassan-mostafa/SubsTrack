import { useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Typography from "@mui/material/Typography";
import {
  removeLineChoice,
  type CancelDateBounds,
  type RemoveLineChoice,
} from "@shared/modules/customer/customer-plans/utils/cancelDate";
import { DateField } from "@/shared/components/DateField";

interface RemovePlanChoiceProps {
  bounds: CancelDateBounds;
  onChange: (choice: RemoveLineChoice) => void;
}

// Only a kept line needs a stop day, so a hard delete hides it.
export function RemovePlanChoice({ bounds, onChange }: RemovePlanChoiceProps) {
  const { t } = useTranslation();
  const [hardDelete, setHardDelete] = useState(false);
  const [cancelDate, setCancelDate] = useState(bounds.max);

  const update = (nextHardDelete: boolean, nextCancelDate: string) => {
    setHardDelete(nextHardDelete);
    setCancelDate(nextCancelDate);
    onChange(removeLineChoice(nextHardDelete, nextCancelDate));
  };

  return (
    <Box sx={{ mt: 2 }}>
      {!hardDelete ? (
        <Box sx={{ mb: 1 }}>
          <DateField
            label={t("subscriptions.cancel_date_label")}
            value={cancelDate}
            onChange={(day) => update(false, day)}
            minDate={bounds.min}
            maxDate={bounds.max}
          />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t("subscriptions.cancel_date_hint")}
          </Typography>
        </Box>
      ) : null}
      <FormControlLabel
        sx={{ alignItems: "flex-start", mt: 1, mx: 0 }}
        control={
          <Checkbox
            color="error"
            checked={hardDelete}
            onChange={(event) => update(event.target.checked, cancelDate)}
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
    </Box>
  );
}
