import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import type { ConfirmSection } from "@shared/shared/lib/confirmStore";

// Each name in its own <bdi>, so an Arabic name never reorders an English line.
export function ConfirmSections({ sections }: { sections: ConfirmSection[] }) {
  return (
    <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      {sections.map((section, index) => (
        <Box key={section.title}>
          {index > 0 ? <Divider sx={{ mb: 2 }} /> : null}
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {section.title}{" "}
            <Box component="span" sx={{ color: "text.secondary", fontWeight: 500 }}>
              ({section.items.length})
            </Box>
          </Typography>
          {section.hint ? (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {section.hint}
            </Typography>
          ) : null}
          <Box component="ul" sx={{ m: 0, ps: 2.5 }}>
            {section.items.map((item, itemIndex) => (
              <Typography key={itemIndex} component="li" variant="body2">
                <bdi>{item.primary}</bdi>
                {item.secondary ? (
                  <Box component="span" sx={{ color: "text.secondary" }}>
                    {" · "}
                    <bdi>{item.secondary}</bdi>
                  </Box>
                ) : null}
              </Typography>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
