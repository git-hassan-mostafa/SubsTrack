import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import type { CustomerPlan } from "@shared/core/types";
import type { LineIndicator } from "@shared/modules/customer/customer-payments/utils/gridSummary";
import { lineLabel } from "@shared/modules/customer/customer-plans/utils/lineLabel";

interface LineTabsProps {
  lines: CustomerPlan[];
  selectedId: string | null;
  indicatorOf: (lineId: string) => LineIndicator | null;
  onSelect: (lineId: string) => void;
}

const DOT_COLOR: Record<LineIndicator, string> = {
  paid: "#16a34a",
  unpaid: "#dc2626",
};

// View only — lines are added and changed in the customer form.
export function LineTabs({ lines, selectedId, indicatorOf, onSelect }: LineTabsProps) {
  const { t } = useTranslation();
  if (lines.length < 2 || !selectedId) return null;

  return (
    <Paper variant="outlined">
      <Tabs
        value={selectedId}
        onChange={(_event, id: string) => onSelect(id)}
        variant="scrollable"
        scrollButtons="auto"
        aria-label={t("web.month_grid.lines")}
      >
        {lines.map((line) => {
          const dot = indicatorOf(line.id);
          const name = lineLabel(line, t("common.no_plan"));
          return (
            <Tab
              key={line.id}
              value={line.id}
              sx={{ opacity: line.active ? 1 : 0.6 }}
              label={
                <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                  {dot ? (
                    <Box
                      component="span"
                      role="img"
                      aria-label={t(`web.month_grid.line_${dot}`)}
                      sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: DOT_COLOR[dot] }}
                    />
                  ) : null}
                  {line.active ? name : `${name} · ${t("subscriptions.cancelled")}`}
                </Box>
              }
            />
          );
        })}
      </Tabs>
    </Paper>
  );
}
