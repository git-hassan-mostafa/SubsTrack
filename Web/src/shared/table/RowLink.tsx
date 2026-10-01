import Link from "@mui/material/Link";

type RowLinkProps = { label: string; tabIndex: -1 | 0 } & (
  | { onClick: () => void; href?: never }
  | { href: string; onClick?: never }
);

// The record's name in its cell; opening it is the row's main action.
export function RowLink({ label, tabIndex, onClick, href }: RowLinkProps) {
  const sx = { fontWeight: 600, textAlign: "start" } as const;
  if (href !== undefined) {
    return (
      <Link href={href} tabIndex={tabIndex} sx={sx}>
        {label}
      </Link>
    );
  }
  return (
    <Link component="button" type="button" tabIndex={tabIndex} onClick={onClick} sx={sx}>
      {label}
    </Link>
  );
}
