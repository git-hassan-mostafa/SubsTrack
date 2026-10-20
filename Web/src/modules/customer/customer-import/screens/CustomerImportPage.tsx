import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useCustomerImport } from "@shared/modules/customer/customer-import/hooks/useCustomerImport";
import { importSummaryTable, rowsToFixTable } from "@shared/modules/customer/customer-import/utils/importResult";
import { filterImportRows, type ImportRowFilter } from "@shared/modules/customer/customer-import/utils/importView";
import type { FilterOption } from "@/shared/table/FilterSelect";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { useBeforeUnload } from "@/shared/hooks/useBeforeUnload";
import { downloadCsv } from "@/shared/lib/downloadCsv";
import { FilterSelect } from "@/shared/table/FilterSelect";
import { markCustomersTableStale } from "@/state/customersTable";
import { ImportFilePicker } from "../components/ImportFilePicker";
import { ImportRowsTable } from "../components/ImportRowsTable";
import { importFileKind, readImportFile } from "../utils/readImportFile";

// Closing the tab mid-run asks first; every finished group is already saved anyway.
export function CustomerImportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const run = useCustomerImport(() => markCustomersTableStale());
  const [readingFile, setReadingFile] = useState(false);
  const [filter, setFilter] = useState<ImportRowFilter | null>(null);
  const { phase, preview, counts, result } = run;
  useBeforeUnload(phase === "importing");

  const pick = async (file: File) => {
    const kind = importFileKind(file.name);
    if (!kind) {
      run.failRead(t("web.customer_import.bad_type"));
      return;
    }
    setFilter(null);
    setReadingFile(true);
    try {
      const sheet = await readImportFile(file, kind);
      await run.openSheet(file.name, sheet);
    } catch {
      run.failRead(t("web.customer_import.bad_file"));
    } finally {
      setReadingFile(false);
    }
  };

  const startOver = () => {
    setFilter(null);
    run.reset();
  };

  if (phase === "pick" || phase === "reading" || !preview || !counts) {
    const busyText = !run.lookupsReady
      ? t("web.customer_import.loading_lists")
      : readingFile || phase === "reading"
        ? t("web.customer_import.reading")
        : null;
    return (
      <Stack spacing={2}>
        <ErrorBanner message={run.error} onDismiss={run.clearError} />
        <ImportFilePicker busyText={busyText} onPick={(file) => void pick(file)} onTemplateFailed={run.failRead} />
      </Stack>
    );
  }

  const notImported = result ? result.byCustomer.size - result.importedCustomers : 0;
  const filterOptions: FilterOption<ImportRowFilter>[] = result
    ? [{ value: "left", label: t("web.customer_import.show_left") }]
    : [
        { value: "problem", label: t("web.customer_import.show_problems") },
        { value: "warning", label: t("web.customer_import.show_warnings") },
      ];

  return (
    <Stack spacing={2}>
      <ErrorBanner message={run.error} onDismiss={run.clearError} />
      <ErrorBanner message={run.tooBig} />
      <ErrorBanner message={preview.fileProblem} />
      <ErrorBanner
        message={result?.failure ? t("web.customer_import.done_failure", { message: result.failure }) : null}
      />
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Typography sx={{ fontWeight: 700 }}>{preview.fileName}</Typography>
          {result ? (
            <>
              <Typography>
                {t("web.customer_import.done_imported", {
                  customers: result.importedCustomers,
                  plans: result.importedLines,
                })}
              </Typography>
              {counts.heldCustomers > 0 ? (
                <Typography>{t("web.customer_import.done_skipped", { count: counts.heldCustomers })}</Typography>
              ) : null}
              {notImported > 0 ? (
                <Typography color="error">
                  {t("web.customer_import.done_not_imported", { count: notImported })}
                </Typography>
              ) : null}
            </>
          ) : preview.fileProblem ? null : (
            <>
              <Typography>
                {t("web.customer_import.ready_count", {
                  customers: counts.readyCustomers,
                  plans: counts.readyLines,
                })}
              </Typography>
              {counts.heldCustomers > 0 ? (
                <Typography color="error">
                  {t("web.customer_import.held_count", { count: counts.heldCustomers })}
                </Typography>
              ) : null}
            </>
          )}
          {preview.unusedColumns.length > 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t("web.customer_import.unused_columns", { names: preview.unusedColumns.join(", ") })}
            </Typography>
          ) : null}
          {phase === "importing" ? (
            <Typography sx={{ fontWeight: 600 }}>
              {t("web.customer_import.importing", { done: run.progress.done, total: run.progress.total })}
            </Typography>
          ) : null}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ pt: 1 }}>
            {result ? (
              <>
                <Button variant="contained" onClick={() => void navigate("/customers")}>
                  {t("web.customer_import.go_to_customers")}
                </Button>
                <Button
                  onClick={() => downloadCsv(t("web.customer_import.file_summary"), importSummaryTable(preview, result))}
                >
                  {t("web.customer_import.download_summary")}
                </Button>
                {result.importedCustomers < preview.customers.length ? (
                  <Button
                    onClick={() => downloadCsv(t("web.customer_import.file_to_fix"), rowsToFixTable(preview, result))}
                  >
                    {t("web.customer_import.download_to_fix")}
                  </Button>
                ) : null}
                <Button onClick={startOver}>{t("web.customer_import.import_another")}</Button>
              </>
            ) : (
              <>
                <Button
                  variant="contained"
                  disabled={phase === "importing" || counts.readyCustomers === 0}
                  onClick={() => {
                    setFilter(null);
                    void run.start();
                  }}
                >
                  {t("web.customer_import.import_button", { count: counts.readyCustomers })}
                </Button>
                <Button disabled={phase === "importing"} onClick={startOver}>
                  {t("web.customer_import.another_file")}
                </Button>
              </>
            )}
          </Stack>
        </Stack>
      </Paper>
      {preview.rows.length > 0 ? (
        <>
          <FilterSelect<ImportRowFilter | null>
            label={t("web.customer_import.column_status")}
            anyLabel={t("web.customer_import.show_all")}
            value={filter}
            onChange={setFilter}
            options={filterOptions}
            minWidth={220}
          />
          <ImportRowsTable rows={filterImportRows(preview.rows, result, filter)} result={result} />
        </>
      ) : null}
    </Stack>
  );
}
