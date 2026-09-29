import { createTheme } from "@mui/material/styles";
import type { LinkProps } from "@mui/material/Link";
import { LinkBehavior } from "./LinkBehavior";

const COLORS = {
  primary: "#2f36a8",
  primaryDark: "#262b86",
  primaryLight: "#eef2ff",
  success: "#22c55e",
  danger: "#ef4444",
  warning: "#f59e0b",
  gray50: "#f9fafb",
  gray200: "#e5e7eb",
  gray500: "#6b7280",
  gray900: "#111827",
} as const;

const NO_MOTION = {
  shortest: 0,
  shorter: 0,
  short: 0,
  standard: 0,
  complex: 0,
  enteringScreen: 0,
  leavingScreen: 0,
};

// Phone colours + font; zero durations kill transitions, spinners still turn.
export const theme = createTheme({
  palette: {
    primary: { main: COLORS.primary, dark: COLORS.primaryDark, light: COLORS.primaryLight },
    success: { main: COLORS.success },
    error: { main: COLORS.danger },
    warning: { main: COLORS.warning },
    background: { default: COLORS.gray50, paper: "#ffffff" },
    text: { primary: COLORS.gray900, secondary: COLORS.gray500 },
    divider: COLORS.gray200,
  },
  typography: {
    fontFamily: '"Cairo", system-ui, "Segoe UI", Arial, sans-serif',
    button: { textTransform: "none", fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  transitions: { duration: NO_MOTION },
  components: {
    MuiButtonBase: {
      defaultProps: { disableRipple: true, LinkComponent: LinkBehavior },
    },
    MuiLink: {
      defaultProps: { component: LinkBehavior } as LinkProps,
    },
    MuiTextField: {
      defaultProps: { slotProps: { inputLabel: { shrink: true } } },
    },
  },
});
