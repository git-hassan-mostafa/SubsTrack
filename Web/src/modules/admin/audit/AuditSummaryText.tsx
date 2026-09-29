import Box from "@mui/material/Box";
import type { SentencePart } from "@shared/modules/admin/audit/utils/sentence";

// Inline runs, not blocks, so one sentence wraps as one paragraph.
export function AuditSummaryText({ parts }: { parts: SentencePart[] }) {
  return parts.map((part, index) => (
    <Box key={index} component="span" sx={{ fontWeight: part.bold ? 600 : 400 }}>
      {part.text}
    </Box>
  ));
}
