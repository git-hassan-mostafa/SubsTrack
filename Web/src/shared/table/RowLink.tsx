import Link from "@mui/material/Link";

interface RowLinkProps {
  label: string;
  tabIndex: -1 | 0;
  onClick: () => void;
}

// The record's name in its cell; opening it is the row's main action.
export function RowLink({ label, tabIndex, onClick }: RowLinkProps) {
  return (
    <Link
      component="button"
      type="button"
      tabIndex={tabIndex}
      onClick={onClick}
      sx={{ fontWeight: 600, textAlign: "start" }}
    >
      {label}
    </Link>
  );
}
