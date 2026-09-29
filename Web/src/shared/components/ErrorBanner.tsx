import Alert from "@mui/material/Alert";

interface ErrorBannerProps {
  message: string | null;
  onDismiss?: () => void;
}

// Errors are shown inline, never as a toast (project rule).
export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  if (!message) return null;
  return (
    <Alert severity="error" onClose={onDismiss}>
      {message}
    </Alert>
  );
}
