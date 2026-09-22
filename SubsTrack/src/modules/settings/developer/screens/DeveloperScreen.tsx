import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { DbTableViewer } from "@/src/shared/components/DbTableViewer";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { CARD_SURFACE, COLORS } from "@/src/shared/constants";
import { confirm } from "@/src/shared/lib/confirm";
import { resetAllDomainStores } from "@/src/shared/lib/storeReset";
import { refreshActiveData } from "@/src/state/refreshActiveData";
import { useAuth } from "@/src/modules/authentication/auth";
import {
  FileTooLargeError,
  newExportFile,
  openWriter,
  pickTextFile,
  shareFile,
} from "@/src/shared/lib/shareFile";
import {
  countUnsyncedWrites,
  getSyncStatus,
  IS_OFFLINE_CAPABLE,
  isOnline,
  RestoreBlockedError,
  restoreBackup,
  resumeSync,
  resyncFromScratch,
  scopeKeyOf,
  suspendSync,
  syncNow,
  TABLES,
  validateBackup,
  writeBackup,
} from "@/src/core/offline";
import type {
  BackupProblem,
  BackupSession,
  BackupWarning,
} from "@/src/core/offline";
import { getDb } from "@/src/core/offline/db/sqlite";

const BOOKKEEPING_TABLES = ["sync_meta", "pending_deletes"];
const ALL_TABLE_NAMES = [...TABLES.map((t) => t.name), ...BOOKKEEPING_TABLES];
const MAX_IMPORT_BYTES = 64 * 1024 * 1024;

const PROBLEM_KEYS: Record<BackupProblem["code"], string> = {
  invalid_file: "settings.developer_import_invalid_json",
  wrong_format: "settings.developer_import_wrong_format",
  newer_version: "settings.developer_import_newer_version",
  missing_table: "settings.developer_import_missing_table",
  unknown_table: "settings.developer_import_unknown_table",
  bad_value: "settings.developer_import_bad_value",
  carries_dirty: "settings.developer_import_carries_dirty",
  missing_id: "settings.developer_import_missing_id",
  duplicate_id: "settings.developer_import_duplicate_id",
  duplicate_key: "settings.developer_import_duplicate_key",
  wrong_tenant: "settings.developer_import_wrong_tenant",
  wrong_tenant_rows: "settings.developer_import_wrong_tenant_rows",
  wrong_branch: "settings.developer_import_wrong_branch",
  missing_profile: "settings.developer_import_missing_profile",
};

function stamp(): string {
  return new Date()
    .toISOString()
    .slice(0, 16)
    .replace(/[-:]/g, "")
    .replace("T", "-");
}

export function DeveloperScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<
    "export" | "import" | "resync" | "sync" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [needsSync, setNeedsSync] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const refreshCounts = useCallback(async () => {
    const db = getDb();
    const next: Record<string, number> = {};
    for (const name of ALL_TABLE_NAMES) {
      const row = await db.getFirstAsync<{ n: number }>(
        `SELECT COUNT(*) AS n FROM ${name}`,
      );
      next[name] = row?.n ?? 0;
    }
    setCounts(next);
  }, []);

  useEffect(() => {
    if (!IS_OFFLINE_CAPABLE || !isAdmin) return;
    void refreshCounts();
  }, [refreshCounts, isAdmin]);

  if (!IS_OFFLINE_CAPABLE || !isAdmin) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <PageHeader
          title={t("settings.developer")}
          showBack
          onBack={() => router.back()}
          hideBranchSelector
        />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-sm text-gray-400 text-center">
            {IS_OFFLINE_CAPABLE
              ? t("settings.developer_admin_only")
              : t("settings.developer_web_unavailable")}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  function flashMessage(message: string) {
    setFlash(message);
    setTimeout(() => setFlash(null), 3000);
  }

  function sessionOf(): BackupSession | null {
    const current = user;
    if (!current) return null;
    return {
      tenantId: current.tenantId,
      tenantCode: current.tenant.tenantCode,
      tenantName: current.tenant.name,
      userId: current.id,
      username: current.username,
      branchId: current.branchId,
    };
  }

  function totalLocalRows(): number {
    return TABLES.reduce((sum, spec) => sum + (counts[spec.name] ?? 0), 0);
  }

  async function handleExport() {
    setError(null);
    setNeedsSync(false);
    const session = sessionOf();
    if (!session) return;

    setBusy("export");
    try {
      const pending = await countUnsyncedWrites();
      if (pending > 0) {
        setNeedsSync(true);
        setError(
          t("settings.developer_export_blocked_unsynced", { count: pending }),
        );
        return;
      }

      flashMessage(t("settings.developer_export_running"));
      const file = newExportFile(
        `sijil-${session.tenantCode}-${stamp()}`,
        "json",
      );
      const writer = openWriter(file);
      suspendSync();
      let total = 0;
      try {
        const result = await writeBackup(
          writer,
          session,
          {
            version: Constants.expoConfig?.version ?? null,
            runtimeVersion:
              typeof Constants.expoConfig?.runtimeVersion === "string"
                ? Constants.expoConfig.runtimeVersion
                : null,
          },
          scopeKeyOf(session.branchId),
        );
        total = result.totalRows;
      } finally {
        writer.close();
        resumeSync();
      }

      const shared = await shareFile(file, "application/json", "public.json");
      if (!shared) {
        setError(t("export.sharing_unavailable"));
        return;
      }
      flashMessage(t("settings.developer_export_done", { rows: total }));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("settings.developer_export_failed"),
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleSyncThenRetry() {
    setError(null);
    setNeedsSync(false);
    setBusy("sync");
    try {
      const { offline } = await syncNow();
      flashMessage(
        offline
          ? t("settings.developer_resync_offline")
          : t("settings.developer_resync_done"),
      );
      await refreshCounts();
    } finally {
      setBusy(null);
    }
  }

  function warningText(warnings: BackupWarning[]): string | null {
    if (warnings.length === 0) return null;
    return warnings
      .map((w) =>
        t("settings.developer_import_dropped_columns", {
          table: w.table,
          columns: w.columns.join(", "),
        }),
      )
      .join("\n");
  }

  async function handleImport() {
    setError(null);
    setNeedsSync(false);
    const session = sessionOf();
    if (!session) return;

    if (getSyncStatus().syncing) {
      setError(t("settings.developer_import_blocked_syncing"));
      return;
    }
    const pending = await countUnsyncedWrites();
    if (pending > 0) {
      setNeedsSync(true);
      setError(
        t("settings.developer_import_blocked_unsynced", { count: pending }),
      );
      return;
    }

    let picked: { name: string; content: string } | null;
    try {
      picked = await pickTextFile("application/json", MAX_IMPORT_BYTES);
    } catch (e) {
      setError(
        e instanceof FileTooLargeError
          ? t("settings.developer_import_too_large")
          : e instanceof Error
            ? e.message
            : String(e),
      );
      return;
    }
    if (!picked) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(picked.content);
    } catch {
      setError(t("settings.developer_import_invalid_json"));
      return;
    }

    const check = validateBackup(parsed, session);
    if (!check.ok) {
      setError(
        t(PROBLEM_KEYS[check.problem.code], {
          table: check.problem.table,
          column: check.problem.column,
          value: check.problem.value,
        }),
      );
      return;
    }

    const warnings = warningText(check.warnings);
    const exportedAt = check.backup.exportedAt
      ? new Date(check.backup.exportedAt).toLocaleString()
      : "—";
    const details = [
      t("settings.developer_import_source", {
        tenant: check.backup.tenant.name || check.backup.tenant.code,
        date: exportedAt,
      }),
      t("settings.developer_import_rows", {
        rows: check.totalRows,
        current: totalLocalRows(),
      }),
      warnings,
    ]
      .filter(Boolean)
      .join("\n\n");

    const proceed = await confirm({
      title: t("settings.developer_import_confirm_title"),
      message: `${details}\n\n${t("settings.developer_import_confirm_message")}`,
      confirmLabel: t("settings.developer_import_confirm_action"),
      destructive: true,
    });
    if (!proceed) return;

    const online = await isOnline();
    const pushToServer = online
      ? await confirm({
          title: t("settings.developer_push_title"),
          message: t("settings.developer_push_message"),
          confirmLabel: t("settings.developer_push_yes"),
          cancelLabel: t("settings.developer_push_no"),
          destructive: true,
        })
      : false;
    if (!online) flashMessage(t("settings.developer_push_offline"));

    setBusy("import");
    suspendSync();
    try {
      await restoreBackup(
        check.backup,
        session,
        { pushToServer },
        (done, total) =>
          setFlash(t("settings.developer_import_running", { done, total })),
      );
      setSelectedTable(null);
      resetAllDomainStores();
      await refreshActiveData();
      await refreshCounts();
      flashMessage(
        t("settings.developer_import_done", { rows: check.totalRows }),
      );
    } catch (e) {
      if (e instanceof RestoreBlockedError) {
        setNeedsSync(true);
        setError(t("settings.developer_import_blocked_unsynced", { count: 1 }));
      } else {
        setError(
          e instanceof Error
            ? e.message
            : t("settings.developer_import_failed"),
        );
      }
      return;
    } finally {
      resumeSync();
      setBusy(null);
    }

    if (pushToServer) {
      setBusy("import");
      try {
        const { ok } = await syncNow();
        flashMessage(
          ok
            ? t("settings.developer_push_done")
            : t("settings.developer_push_failed"),
        );
      } finally {
        setBusy(null);
        await refreshCounts();
      }
    }
  }

  // forget the pull cursor and re-pull — repairs a mirror that skipped rows
  async function handleResync() {
    setBusy("resync");
    flashMessage(t("settings.developer_resync_running"));
    try {
      const { ok, offline } = await resyncFromScratch();
      await refreshCounts();
      flashMessage(
        offline
          ? t("settings.developer_resync_offline")
          : ok
            ? t("settings.developer_resync_done")
            : t("settings.developer_resync_failed"),
      );
    } finally {
      setBusy(null);
    }
  }

  if (selectedTable) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <PageHeader
          title={selectedTable}
          showBack
          onBack={() => setSelectedTable(null)}
          hideBranchSelector
        />
        <DbTableViewer tableName={selectedTable} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        title={t("settings.developer")}
        showBack
        onBack={() => router.back()}
        hideBranchSelector
      />
      <ResponsiveContainer className="flex-1">
        <ScrollView>
          {error ? (
            <View className="mx-4 mt-4">
              <ErrorBanner message={error} onDismiss={() => setError(null)} />
              {needsSync ? (
                <Button
                  label={t("settings.developer_export_sync_action")}
                  onPress={() => void handleSyncThenRetry()}
                  loading={busy === "sync"}
                  disabled={busy !== null}
                  variant="ghost"
                  fullWidth
                />
              ) : null}
            </View>
          ) : null}

          <View className="mx-4 mt-4 mb-3 flex-row gap-3">
            <View className="flex-1">
              <Button
                label={t("settings.developer_export")}
                onPress={() => void handleExport()}
                loading={busy === "export"}
                disabled={busy !== null}
                variant="ghost"
              />
            </View>
            <View className="flex-1">
              <Button
                label={t("settings.developer_import")}
                onPress={() => void handleImport()}
                loading={busy === "import"}
                disabled={busy !== null}
                variant="ghost"
              />
            </View>
          </View>

          <View className="mx-4 mb-3">
            <Button
              label={t("settings.developer_resync")}
              onPress={() => void handleResync()}
              loading={busy === "resync"}
              disabled={busy !== null}
              variant="ghost"
              fullWidth
            />
          </View>

          <View className="mx-4 mb-8">
            <Text
              fontWeight="SemiBold"
              className="text-xs text-gray-400 uppercase tracking-wide mb-2 px-1"
            >
              {t("settings.developer_tables_section")}
            </Text>
            <View className={`${CARD_SURFACE} overflow-hidden`}>
              {ALL_TABLE_NAMES.map((name, index) => (
                <PressableOpacity
                  key={name}
                  onPress={() => setSelectedTable(name)}
                  className={`flex-row items-center justify-between px-4 py-3.5 ${
                    index === ALL_TABLE_NAMES.length - 1
                      ? ""
                      : "border-b border-gray-100"
                  }`}
                >
                  <Text fontWeight="Medium" className="text-sm text-gray-900">
                    {name}
                  </Text>
                  <View className="flex-row items-center gap-1">
                    <Text className="text-sm text-gray-400">
                      {counts[name] ?? "…"}
                    </Text>
                    <DirectionalIcon
                      name="chevron-forward"
                      size={14}
                      color={COLORS.gray300}
                    />
                  </View>
                </PressableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>

        {flash ? (
          <View className="absolute inset-x-0 bottom-0 px-4 pb-4">
            <View className="bg-success rounded-xl px-4 py-3">
              <Text
                fontWeight="Medium"
                className="text-sm text-white text-center"
              >
                {flash}
              </Text>
            </View>
          </View>
        ) : null}
      </ResponsiveContainer>
    </SafeAreaView>
  );
}
