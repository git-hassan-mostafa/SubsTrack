import type { Theme } from "@mui/material/styles";

// MUI icons never mirror themselves; an arrow meaning back / next / out must.
export function flipInRtl(theme: Theme) {
  return theme.direction === "rtl" ? { transform: "scaleX(-1)" } : {};
}
