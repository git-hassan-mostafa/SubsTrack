import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { SheetModal } from "@/src/shared/components/SheetModal";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { Input } from "@/src/shared/components/Input";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { DbTableViewer } from "@/src/shared/components/DbTableViewer";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { COLORS } from "@/src/shared/constants";
import { confirm } from "@/src/shared/lib/confirm";
import { IS_OFFLINE_CAPABLE, TABLES, resyncFromScratch } from "@/src/core/offline";
import { getDb } from "@/src/core/offline/db/sqlite";

// Local-only bookkeeping tables that live outside the TABLES descriptor
// (see src/core/offline/db/schema.ts) — included here so the Developer page
// shows literally everything in the local SQLite file.
const BOOKKEEPING_TABLES = ["sync_meta", "pending_deletes"];
const ALL_TABLE_NAMES = [...TABLES.map((t) => t.name), ...BOOKKEEPING_TABLES];

export function DeveloperScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [resyncBusy, setResyncBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!IS_OFFLINE_CAPABLE) return;
    void refreshCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-linking could theoretically reach this route on web; there is
  // nothing to show since web has no local SQLite mirror.
  if (!IS_OFFLINE_CAPABLE) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <PageHeader title={t("settings.developer")} showBack onBack={() => router.back()} hideBranchSelector />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-sm text-gray-400 text-center">{t("settings.developer_web_unavailable")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  function flashMessage(message: string) {
    setFlash(message);
    setTimeout(() => setFlash(null), 3000);
  }

  async function handleExport() {
    const db = getDb();
    const dump: Record<string, Record<string, unknown>[]> = {};
    for (const name of ALL_TABLE_NAMES) {
      dump[name] = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${name}`);
    }
    await Clipboard.setStringAsync(JSON.stringify(dump));
    flashMessage(t("settings.developer_export_done"));
  }

  async function refreshCounts() {
    const db = getDb();
    const next: Record<string, number> = {};
    for (const name of ALL_TABLE_NAMES) {
      const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${name}`);
      next[name] = row?.n ?? 0;
    }
    setCounts(next);
  }

  // Forget the pull cursor and re-pull the whole tenant. Repairs a mirror whose
  // incremental pull skipped rows; non-destructive (un-pushed local writes go up
  // first and still win the merge).
  async function handleResync() {
    setResyncBusy(true);
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
      setResyncBusy(false);
    }
  }

  async function handleImportConfirm() {
    setImportError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      setImportError(t("settings.developer_import_invalid_json"));
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setImportError(t("settings.developer_import_invalid_json"));
      return;
    }
    const data = parsed as Record<string, unknown>;
    const unknownKeys = Object.keys(data).filter((k) => !ALL_TABLE_NAMES.includes(k));
    if (unknownKeys.length > 0) {
      setImportError(t("settings.developer_import_unknown_table", { table: unknownKeys[0] }));
      return;
    }

    const ok = await confirm({
      title: t("settings.developer_import_confirm_title"),
      message: t("settings.developer_import_confirm_message"),
      confirmLabel: t("settings.developer_import_confirm_action"),
      destructive: true,
    });
    if (!ok) return;

    setImportBusy(true);
    try {
      const db = getDb();
      await db.withTransactionAsync(async () => {
        // "old data completely removed" — wipe every known table first,
        // then insert only the rows the pasted JSON actually contains.
        for (const name of ALL_TABLE_NAMES) {
          await db.execAsync(`DELETE FROM ${name};`);
        }
        for (const [table, rows] of Object.entries(data)) {
          if (!Array.isArray(rows)) continue;
          for (const row of rows) {
            if (!row || typeof row !== "object") continue;
            const entries = Object.entries(row as Record<string, unknown>);
            if (entries.length === 0) continue;
            const columns = entries.map(([col]) => col);
            const values = entries.map(([, v]) => v);
            const placeholders = columns.map(() => "?").join(", ");
            await db.runAsync(
              `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
              values as never[],
            );
          }
        }
      });
      setImportOpen(false);
      setImportText("");
      setSelectedTable(null);
      await refreshCounts();
      flashMessage(t("settings.developer_import_done"));
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    } finally {
      setImportBusy(false);
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
      <PageHeader title={t("settings.developer")} showBack onBack={() => router.back()} hideBranchSelector />
      <ResponsiveContainer className="flex-1">
        <ScrollView>
          <View className="mx-4 mt-4 mb-3 flex-row gap-3">
            <View className="flex-1">
              <Button label={t("settings.developer_export")} onPress={() => void handleExport()} variant="ghost" />
            </View>
            <View className="flex-1">
              <Button
                label={t("settings.developer_import")}
                onPress={() => {
                  setImportText("");
                  setImportError(null);
                  setImportOpen(true);
                }}
                variant="ghost"
              />
            </View>
          </View>

          <View className="mx-4 mb-3">
            <Button
              label={t("settings.developer_resync")}
              onPress={() => void handleResync()}
              loading={resyncBusy}
              disabled={resyncBusy}
              variant="ghost"
              fullWidth
            />
          </View>

          <View className="mx-4 mb-8">
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
              {t("settings.developer_tables_section")}
            </Text>
            <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {ALL_TABLE_NAMES.map((name, index) => (
                <PressableOpacity
                  key={name}
                  onPress={() => setSelectedTable(name)}
                  className={`flex-row items-center justify-between px-4 py-3.5 ${
                    index === ALL_TABLE_NAMES.length - 1 ? "" : "border-b border-gray-100"
                  }`}
                >
                  <Text className="text-sm font-medium text-gray-900">{name}</Text>
                  <View className="flex-row items-center gap-1">
                    <Text className="text-sm text-gray-400">{counts[name] ?? "…"}</Text>
                    <DirectionalIcon name="chevron-forward" size={14} color={COLORS.gray300} />
                  </View>
                </PressableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>

        {flash ? (
          <View className="absolute inset-x-0 bottom-0 px-4 pb-4">
            <View className="bg-success rounded-xl px-4 py-3">
              <Text className="text-sm font-medium text-white text-center">{flash}</Text>
            </View>
          </View>
        ) : null}
      </ResponsiveContainer>

      <SheetModal visible={importOpen} onDismiss={() => setImportOpen(false)}>
        <SafeAreaView className="flex-1 bg-white">
          <ResponsiveContainer className="flex-1">
            <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
              <Text fontWeight="Bold" className="text-lg text-gray-900">
                {t("settings.developer_import")}
              </Text>
              <PressableOpacity onPress={() => setImportOpen(false)}>
                <Text className="text-base text-primary font-medium">{t("common.cancel")}</Text>
              </PressableOpacity>
            </View>
            <ScrollView className="flex-1 px-6 pt-6" keyboardShouldPersistTaps="handled">
              {importError ? <ErrorBanner message={importError} onDismiss={() => setImportError(null)} /> : null}
              <Text className="text-sm text-gray-500 mb-3">{t("settings.developer_import_hint")}</Text>
              <Input
                value={importText}
                onChangeText={setImportText}
                placeholder={t("settings.developer_import_placeholder")}
                multiline
                numberOfLines={12}
                textAlignVertical="top"
                style={{ minHeight: 220 }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Button
                label={t("settings.developer_import_confirm_action")}
                onPress={() => void handleImportConfirm()}
                loading={importBusy}
                disabled={!importText.trim() || importBusy}
                variant="danger"
                fullWidth
              />
              <View className="h-8" />
            </ScrollView>
          </ResponsiveContainer>
        </SafeAreaView>
      </SheetModal>
    </SafeAreaView>
  );
}
