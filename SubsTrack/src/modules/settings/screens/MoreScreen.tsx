import { useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { Screen } from "@/src/shared/components/Screen";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Avatar } from "@/src/shared/components/Avatar";
import { ListGroup } from "@/src/shared/components/ListGroup";
import { ListRow } from "@/src/shared/components/ListRow";
import { useTranslation } from "react-i18next";
import { useRouter, type Href } from "expo-router";
import { DropdownModal } from "@/src/shared/components/Dropdown";
import { CARD_SURFACE, COLORS } from "@/src/shared/constants";
import { confirm } from "@shared/shared/lib/confirm";
import { LANGUAGE_NAMES } from "@shared/core/i18n";
import {
  useLanguageStore,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from "@/src/core/i18n/languageStore";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { roleLabelKey } from "@shared/modules/admin/users/utils/userRules";
import { endSession } from "@shared/shared/lib/session";
import { IS_OFFLINE_CAPABLE, syncNow } from "@/src/core/offline";
import { useSyncStatus } from "@/src/shared/hooks/useSyncStatus";
import { refreshActiveData } from "@shared/state/refreshActiveData";
import { formatDateTimeShort } from "@shared/core/utils/date";
import * as Updates from "expo-updates";
import Constants from "expo-constants";
import { useCopyText } from "@/src/shared/hooks/useCopyText";
import { openUrl } from "@/src/shared/lib/openUrl";
import { useLegalLinks } from "@shared/state/hooks/useOptionSlice";
import { AdminSection } from "../components/AdminSection";

type SyncFailure = "offline" | "failed";

// sync failure stays inline; success shows as the new sync time
export function MoreScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { copied, copy } = useCopyText();
  const legal = useLegalLinks();
  const fingerprint =
    Updates.runtimeVersion ??
    (typeof Constants.expoConfig?.runtimeVersion === "string"
      ? Constants.expoConfig.runtimeVersion
      : null);
  const appVersion = Constants.expoConfig?.version;
  const { language, setLanguage } = useLanguageStore();
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const { lastPushAt, lastPullAt, lastManualSyncAt } = useSyncStatus();
  const [manualSyncing, setManualSyncing] = useState(false);
  const [syncFailure, setSyncFailure] = useState<SyncFailure | null>(null);

  async function handleSyncPress() {
    if (manualSyncing) return;
    setSyncFailure(null);
    setManualSyncing(true);
    try {
      const { ok, offline } = await syncNow();
      setSyncFailure(offline ? "offline" : ok ? null : "failed");
      refreshActiveData();
    } finally {
      setManualSyncing(false);
    }
  }

  const languageOptions = SUPPORTED_LANGUAGES.map((lang) => ({
    label: LANGUAGE_NAMES[lang],
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

  async function handleDeleteAccountPress(deleteAccountUrl: string) {
    const ok = await confirm({
      title: t("legal.delete_account"),
      message: t("legal.delete_account_confirm"),
      confirmLabel: t("legal.continue"),
      destructive: true,
    });
    if (ok) await openUrl(deleteAccountUrl);
  }

  async function handleLogoutPress() {
    await confirm({
      title: t("settings.logout"),
      message: t("settings.logout_confirm"),
      confirmLabel: t("settings.logout"),
      destructive: true,
      onConfirm: endSession,
    });
  }

  const syncTime = (at: string | null) =>
    at ? formatDateTimeShort(at) : t("settings.sync_never");

  const branchName = user?.branchId
    ? (user.branch?.name ?? "")
    : t("branches.tenant_wide_admin");

  return (
    <Screen>
      <PageHeader title={t("more.title")} hideQuickActions />
      <ResponsiveContainer className="flex-1">
        <ScrollView contentContainerStyle={{ paddingTop: 8 }}>
          {user ? (
            <View
              className={`${CARD_SURFACE} mx-4 mb-5 px-4 py-4 flex-row items-center`}
            >
              <Avatar name={user.fullName} size={56} />
              <View className="flex-1 ms-4">
                <Text
                  fontWeight="SemiBold"
                  className="text-lg text-gray-900"
                  numberOfLines={1}
                >
                  {user.fullName}
                </Text>
                <Text className="text-sm text-gray-500" numberOfLines={1}>
                  @{user.username} · {t(roleLabelKey(user.role))}
                </Text>
                <Text className="text-sm text-gray-500" numberOfLines={1}>
                  {user.tenant.name}
                  {branchName ? ` · ${branchName}` : ""}
                </Text>
              </View>
            </View>
          ) : null}

          {isAdmin ? <AdminSection /> : null}

          <ListGroup>
            <ListRow
              icon="wallet-outline"
              title={t("wallet.my_title")}
              onPress={() => router.push("/(app)/(tabs)/more/my-wallet" as Href)}
            />
          </ListGroup>

          <ListGroup label={t("settings.preferences_section")}>
            <ListRow
              icon="globe-outline"
              title={t("settings.language_section")}
              value={LANGUAGE_NAMES[language]}
              onPress={() => setLanguagePickerOpen(true)}
            />
          </ListGroup>

          {IS_OFFLINE_CAPABLE ? (
            <View>
              {syncFailure ? (
                <View className="mx-4">
                  <ErrorBanner
                    message={
                      syncFailure === "offline"
                        ? t("settings.sync_offline")
                        : t("settings.sync_failed")
                    }
                    onDismiss={() => setSyncFailure(null)}
                  />
                </View>
              ) : null}
              <ListGroup label={t("settings.data_section")}>
                <ListRow
                  icon="sync-outline"
                  title={t("settings.sync_now")}
                  disabled={manualSyncing}
                  onPress={() => void handleSyncPress()}
                  trailing={
                    manualSyncing ? (
                      <ActivityIndicator size="small" color={COLORS.gray400} />
                    ) : undefined
                  }
                />
                <ListRow
                  icon="cloud-upload-outline"
                  title={t("settings.last_push")}
                  value={syncTime(lastPushAt)}
                />
                <ListRow
                  icon="cloud-download-outline"
                  title={t("settings.last_pull")}
                  value={syncTime(lastPullAt)}
                />
                <ListRow
                  icon="time-outline"
                  title={t("settings.last_manual_sync")}
                  value={syncTime(lastManualSyncAt)}
                />
                {isAdmin ? (
                  <ListRow
                    icon="code-slash-outline"
                    title={t("settings.developer")}
                    onPress={() =>
                      router.push("/(app)/(tabs)/more/developer" as Href)
                    }
                  />
                ) : null}
              </ListGroup>
            </View>
          ) : null}

          {legal ? (
            <ListGroup label={t("legal.section")}>
              <ListRow
                icon="shield-checkmark-outline"
                title={t("legal.privacy")}
                onPress={() => void openUrl(legal.privacy)}
              />
              <ListRow
                icon="document-text-outline"
                title={t("legal.terms")}
                onPress={() => void openUrl(legal.terms)}
              />
              <ListRow
                icon="trash-outline"
                title={t("legal.delete_account")}
                destructive
                onPress={() => void handleDeleteAccountPress(legal.deleteAccount)}
              />
            </ListGroup>
          ) : null}

          <ListGroup className="mx-4 mb-6">
            <ListRow
              icon="log-out-outline"
              title={t("settings.logout")}
              destructive
              onPress={() => void handleLogoutPress()}
            />
          </ListGroup>

          <PressableOpacity
            onPress={fingerprint ? () => void copy(fingerprint) : undefined}
            ripple="none"
            className="items-center pb-8"
          >
            {appVersion ? (
              <Text className="text-xs text-gray-500">v{appVersion}</Text>
            ) : null}
            {fingerprint ? (
              <Text className="text-xs text-gray-400 font-mono mt-0.5">
                {copied ? t("common.copied") : fingerprint}
              </Text>
            ) : null}
          </PressableOpacity>
        </ScrollView>
      </ResponsiveContainer>

      <DropdownModal<SupportedLanguage>
        visible={languagePickerOpen}
        onClose={() => setLanguagePickerOpen(false)}
        title={t("settings.language_section")}
        options={languageOptions}
        value={language}
        onChange={(val) => void handleLanguageSelect(val)}
      />
    </Screen>
  );
}
