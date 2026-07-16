import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { useTranslation } from "react-i18next";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { DropdownModal } from "@/src/shared/components/Dropdown";
import { COLORS } from "@/src/shared/constants";
import { confirm } from "@/src/shared/lib/confirm";
import {
  useLanguageStore,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from "@/src/core/i18n/languageStore";
import { useAuth } from "@/src/modules/authentication/auth";
import { useAuthSlice } from "@/src/state/hooks/useAuthSlice";
import { resetAllDomainStores } from "@/src/shared/lib/storeReset";
import { IS_OFFLINE_CAPABLE, syncNow } from "@/src/core/offline";
import { useSyncStatus } from "@/src/shared/hooks/useSyncStatus";

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  ar: "العربية",
};

function SettingsRow({
  icon,
  label,
  value,
  last,
  onPress,
  destructive,
}: {
  icon: string;
  label: string;
  value?: string;
  last?: boolean;
  onPress?: () => void;
  destructive?: boolean;
}) {
  return (
    <PressableOpacity
      onPress={onPress}
      className={`flex-row items-center justify-between px-4 py-3.5 ${last ? "" : "border-b border-gray-100"}`}
    >
      <View className="flex-row items-center gap-3">
        <Ionicons
          name={icon as any}
          size={18}
          color={destructive ? COLORS.danger : COLORS.gray500}
        />
        <Text
          className={`text-sm font-medium ${destructive ? "text-red-500" : "text-gray-900"}`}
        >
          {label}
        </Text>
      </View>
      <View className="flex-row items-center gap-1">
        {value ? <Text className="text-sm text-gray-400">{value}</Text> : null}
        <DirectionalIcon
          name="chevron-forward"
          size={14}
          color={COLORS.gray300}
        />
      </View>
    </PressableOpacity>
  );
}

export function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { language, setLanguage } = useLanguageStore();
  const logout = useAuthSlice((s) => s.logout);
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const { syncing } = useSyncStatus();
  // Transient one-off result shown briefly after a manual sync attempt.
  const [syncResult, setSyncResult] = useState<
    "done" | "offline" | "failed" | null
  >(null);
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resultTimer.current) clearTimeout(resultTimer.current);
    };
  }, []);

  function flashResult(result: "done" | "offline" | "failed") {
    if (resultTimer.current) clearTimeout(resultTimer.current);
    setSyncResult(result);
    resultTimer.current = setTimeout(() => setSyncResult(null), 3000);
  }

  async function handleSyncPress() {
    if (syncing) return;
    setSyncResult(null);
    const { ok, offline } = await syncNow();
    flashResult(offline ? "offline" : ok ? "done" : "failed");
  }

  const languageOptions = SUPPORTED_LANGUAGES.map((lang) => ({
    label: LANGUAGE_LABELS[lang],
    value: lang,
  }));

  async function handleLanguageSelect(lang: SupportedLanguage | null) {
    if (!lang || lang === language) return;
    const ok = await confirm({
      title: t("settings.language_section"),
      message: t("settings.restart_notice"),
      confirmLabel: t("common.confirm"),
    });
    if (!ok) return;
    setLanguage(lang);
  }

  async function handleLogoutPress() {
    const ok = await confirm({
      title: t("settings.logout"),
      message: t("settings.logout_confirm"),
      confirmLabel: t("settings.logout"),
      destructive: true,
    });
    if (!ok) return;
    await logout();
    resetAllDomainStores();
  }
  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ResponsiveContainer className="flex-1">
        <ScrollView>
          <View className="px-5 pt-5 pb-4">
            <Text fontWeight="Bold" className="text-2xl text-gray-900">
              {t("settings.title")}
            </Text>
          </View>

          {/* Profile card */}
          {user ? (
            <View className="mx-4 mb-5 bg-white rounded-2xl border border-gray-100 px-4 py-4 flex-row items-center">
              <View className="w-10 h-10 rounded-xl bg-success-light items-center justify-center me-3">
                <Ionicons name="person" size={18} color={COLORS.success} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-gray-900">
                  {user.fullName}
                </Text>
                <Text className="text-xs text-gray-400 mt-0.5">
                  @{user.username} · {user.role} · {user.tenant.name}
                </Text>
              </View>
              <DirectionalIcon
                name="chevron-forward"
                size={16}
                color={COLORS.gray300}
              />
            </View>
          ) : null}

          {/* My wallet — cash this user has collected but not handed over yet. */}
          <View className="mx-4 mb-5">
            <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <SettingsRow
                icon="wallet-outline"
                label={t("wallet.my_title")}
                last
                onPress={() =>
                  router.push("/(app)/(tabs)/settings/my-wallet" as Href)
                }
              />
            </View>
          </View>

          {/* Preferences */}
          <View className="mx-4 mb-5">
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
              {t("settings.preferences_section")}
            </Text>
            <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <PressableOpacity
                onPress={() => setLanguagePickerOpen(true)}
                className="flex-row items-center justify-between px-4 py-3.5"
              >
                <View className="flex-row items-center gap-3">
                  <Ionicons
                    name="globe-outline"
                    size={18}
                    color={COLORS.gray500}
                  />
                  <Text className="text-sm font-medium text-gray-900">
                    {t("settings.language_section")}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1">
                  <Text className="text-sm text-gray-400">
                    {LANGUAGE_LABELS[language]}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={14}
                    color={COLORS.gray400}
                  />
                </View>
              </PressableOpacity>
            </View>
          </View>

          {/* Workspace */}
          <View className="mx-4 mb-5">
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
              {t("settings.workspace")}
            </Text>
            <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <SettingsRow
                icon="grid-outline"
                label={t("settings.workspace")}
                value={user?.tenant.name}
              />
              <SettingsRow
                icon="git-branch-outline"
                label={t("settings.branch")}
                value={
                  user?.branchId
                    ? (user.branch?.name ?? "")
                    : t("branches.tenant_wide_admin")
                }
                last
              />
            </View>
          </View>

          {/* Data / sync — native only (web talks to Supabase directly) */}
          {IS_OFFLINE_CAPABLE ? (
            <View className="mx-4 mb-5">
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
                {t("settings.data_section")}
              </Text>
              <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <PressableOpacity
                  onPress={() => void handleSyncPress()}
                  disabled={syncing}
                  className="flex-row items-center justify-between px-4 py-3.5 border-b border-gray-100"
                >
                  <View className="flex-row items-center gap-3">
                    <Ionicons
                      name="sync-outline"
                      size={18}
                      color={COLORS.gray500}
                    />
                    <Text className="text-sm font-medium text-gray-900">
                      {t("settings.sync_now")}
                    </Text>
                  </View>
                  {syncing ? (
                    <ActivityIndicator size="small" color={COLORS.gray400} />
                  ) : (
                    <DirectionalIcon
                      name="chevron-forward"
                      size={14}
                      color={COLORS.gray300}
                    />
                  )}
                </PressableOpacity>
                <SettingsRow
                  icon="code-slash-outline"
                  label={t("settings.developer")}
                  last
                  onPress={() =>
                    router.push("/(app)/(tabs)/settings/developer")
                  }
                />
              </View>
            </View>
          ) : null}

          {/* Logout */}
          <View className="mx-4 mb-8">
            <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <SettingsRow
                icon="log-out-outline"
                label={t("settings.logout")}
                last
                onPress={() => void handleLogoutPress()}
                destructive
              />
            </View>
          </View>
        </ScrollView>

        {/* Manual-sync result flash (the "syncing" state itself is shown by the
            global SyncIndicator, so this only covers the one-off outcome). */}
        {IS_OFFLINE_CAPABLE && syncResult ? (
          <View className="absolute inset-x-0 bottom-0 px-4 pb-4">
            <View
              className={`flex-row items-center gap-2 rounded-xl px-4 py-3 ${
                syncResult === "done" ? "bg-success" : "bg-red-500"
              }`}
            >
              <Ionicons
                name={
                  syncResult === "done" ? "checkmark-circle" : "alert-circle"
                }
                size={18}
                color="#fff"
              />
              <Text className="flex-1 text-sm font-medium text-white">
                {syncResult === "done"
                  ? t("settings.sync_done")
                  : syncResult === "offline"
                    ? t("settings.sync_offline")
                    : t("settings.sync_failed")}
              </Text>
            </View>
          </View>
        ) : null}
      </ResponsiveContainer>

      <DropdownModal<SupportedLanguage>
        visible={languagePickerOpen}
        onClose={() => setLanguagePickerOpen(false)}
        title={t("settings.language_section")}
        options={languageOptions}
        value={language}
        hideSearch
        onChange={(val) => void handleLanguageSelect(val)}
      />
    </SafeAreaView>
  );
}
