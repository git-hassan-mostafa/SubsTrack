import { useTranslation } from "react-i18next";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";

interface ErrorBannerProps {
  message: string | null;
  onDismiss?: () => void;
  onRetry?: () => void;
  severity?: "error" | "info";
}

// Errors are shown inline, never as a toast (project rule); "info" is a plain notice.
export function ErrorBanner({ message, onDismiss, onRetry, severity = "error" }: ErrorBannerProps) {
  const { t } = useTranslation();
  if (!message) return null;
  return (
    <Alert
      severity={severity}
      onClose={onDismiss}
      action={
        onRetry ? (
          <Button color="inherit" size="small" onClick={onRetry}>
            {t("common.try_again")}
          </Button>
        ) : undefined
      }
    >
      {message}
    </Alert>
  );
}
