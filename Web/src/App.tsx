import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { RouterProvider } from "react-router";
import { theme } from "@/app/theme/theme";
import { router } from "@/app/routes/router";

export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <RouterProvider router={router} />
      </LocalizationProvider>
    </ThemeProvider>
  );
}
