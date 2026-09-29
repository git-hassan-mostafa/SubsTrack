import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

interface EmptyStateProps {
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, hint, actionLabel, onAction }: EmptyStateProps) {
  return (
    <Box sx={{ py: 8, px: 3, textAlign: "center" }}>
      <Typography variant="h6" component="p" color="text.secondary">
        {title}
      </Typography>
      {hint ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {hint}
        </Typography>
      ) : null}
      {actionLabel && onAction ? (
        <Button variant="contained" onClick={onAction} sx={{ mt: 3 }}>
          {actionLabel}
        </Button>
      ) : null}
    </Box>
  );
}
