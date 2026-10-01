import { useId, type ReactNode } from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

interface PanelSectionProps {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}

// A titled block of a detail page; the table inside keeps its own border.
export function PanelSection({ title, actions, children }: PanelSectionProps) {
  const titleId = useId();
  return (
    <Stack component="section" aria-labelledby={titleId} spacing={1.5} sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1, minHeight: 40 }}>
        <Typography id={titleId} variant="h6" component="h3" sx={{ fontWeight: 700, flexGrow: 1 }}>
          {title}
        </Typography>
        {actions}
      </Stack>
      {children}
    </Stack>
  );
}
