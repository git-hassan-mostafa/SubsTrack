import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/src/shared/constants";
import { PressableOpacity } from "./PressableOpacity/PressableOpacity";

const SETTINGS_HREF = "/(app)/(tabs)/settings" as Href;

/**
 * Header shortcut to Settings. It left the bottom tab bar, so every screen
 * carries it next to the quick-actions menu — hidden while already in Settings.
 *
 * Lives here rather than inside PageHeader because the dashboard hand-rolls its
 * own header and needs the same button (same reason as QuickActionsMenuButton).
 */
export function SettingsButton() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();

  // `(app)` / `(tabs)` are route groups, so the settings tab is just "/settings".
  if (pathname.startsWith("/settings")) return null;

  return (
    <PressableOpacity
      onPress={() => router.push(SETTINGS_HREF)}
      className="p-1"
      hitSlop={8}
      accessibilityLabel={t("settings.title")}
    >
      <Ionicons name="settings" size={22} color={COLORS.gray700} />
    </PressableOpacity>
  );
}
