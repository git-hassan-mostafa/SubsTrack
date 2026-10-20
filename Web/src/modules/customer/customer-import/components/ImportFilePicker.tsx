import { useRef } from "react";
import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import UploadFileOutlined from "@mui/icons-material/UploadFileOutlined";
import { isRtlLanguage } from "@shared/core/i18n";
import { downloadImportTemplate } from "../utils/downloadImportTemplate";
import { IMPORT_FILE_ACCEPT } from "../utils/readImportFile";

interface ImportFilePickerProps {
  busyText: string | null;
  onPick: (file: File) => void;
  onTemplateFailed: (message: string) => void;
}

// The input is cleared after each pick, so the same fixed file can be read again.
export function ImportFilePicker({ busyText, onPick, onTemplateFailed }: ImportFilePickerProps) {
  const { t, i18n } = useTranslation();
  const input = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    downloadImportTemplate(t("web.customer_import.file_template"), isRtlLanguage(i18n.language)).catch(() =>
      onTemplateFailed(t("web.customer_import.template_failed")),
    );
  };

  return (
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 760 }}>
      <Stack spacing={2}>
        <Typography>{t("web.customer_import.intro")}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t("web.customer_import.rules")}
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <Button
            variant="contained"
            startIcon={<UploadFileOutlined />}
            disabled={busyText !== null}
            onClick={() => input.current?.click()}
          >
            {t("web.customer_import.choose")}
          </Button>
          <Button
            startIcon={<FileDownloadOutlined />}
            onClick={downloadTemplate}
          >
            {t("web.customer_import.template")}
          </Button>
        </Stack>
        {busyText ? (
          <Typography variant="body2" color="text.secondary">
            {busyText}
          </Typography>
        ) : null}
        <input
          ref={input}
          type="file"
          accept={IMPORT_FILE_ACCEPT}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onPick(file);
          }}
        />
      </Stack>
    </Paper>
  );
}
