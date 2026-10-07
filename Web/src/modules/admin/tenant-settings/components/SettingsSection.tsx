import { useId, type ReactNode } from "react";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

interface SettingsSectionProps {
  title: string;
  hint?: string;
  children: ReactNode;
}

export function SettingsSection({ title, hint, children }: SettingsSectionProps) {
  const titleId = useId();
  return (
    <Paper variant="outlined" component="section" aria-labelledby={titleId} sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Stack spacing={0.5}>
          <Typography id={titleId} variant="h6" component="h2" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          {hint ? (
            <Typography variant="body2" color="text.secondary">
              {hint}
            </Typography>
          ) : null}
        </Stack>
        {children}
      </Stack>
    </Paper>
  );
}
