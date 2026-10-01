import type { ReactNode } from "react";
import Stack from "@mui/material/Stack";

// A single sideways-scrolling row of filters; top padding keeps labels whole.
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      useFlexGap
      sx={{
        flex: 1,
        minWidth: 0,
        maxWidth: "100%",
        alignItems: "center",
        overflowX: "auto",
        pt: 1.5,
        pb: 0.5,
        mt: -1.5,
        mb: -0.5,
        "& > *": { flexShrink: 0 },
      }}
    >
      {children}
    </Stack>
  );
}
