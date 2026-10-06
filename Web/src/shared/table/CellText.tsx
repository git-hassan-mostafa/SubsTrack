import Box from "@mui/material/Box";

// A grid cell's plain value; its own box so a long one still ends in "…".
export function CellText({ text }: { text: string }) {
  return (
    <Box component="span" title={text} sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
      {text}
    </Box>
  );
}
