import { useTranslation } from "react-i18next";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import type { CsvTable } from "@shared/shared/lib/csv";
import { downloadCsv } from "@/shared/lib/downloadCsv";

interface CsvButtonProps {
  name: string;
  build: () => CsvTable;
  label?: string;
}

// Built only on click, so a big table costs nothing until someone asks for it.
export function CsvButton({ name, build, label }: CsvButtonProps) {
  const { t } = useTranslation();
  const text = label ?? t("reports.export");
  return (
    <Tooltip title={text}>
      <IconButton aria-label={text} onClick={() => downloadCsv(name, build())}>
        <FileDownloadOutlined />
      </IconButton>
    </Tooltip>
  );
}
