import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export interface InfoRow {
  label: string;
  value: string | null | undefined;
}

// Empty rows are dropped here, so callers list every field they MIGHT have.
export function InfoRows({ rows }: { rows: InfoRow[] }) {
  const filled = rows.filter((row) => !!row.value);
  if (filled.length === 0) return null;
  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        px: 2,
        py: 1.5,
        borderRadius: 1,
        bgcolor: "background.default",
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        columnGap: 3,
        rowGap: 1,
      }}
    >
      {filled.map((row) => (
        <Box key={row.label} sx={{ display: "contents" }}>
          <Typography component="dt" variant="body2" color="text.secondary">
            {row.label}
          </Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0, textAlign: "end" }}>
            {row.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
