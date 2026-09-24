import { useState } from "react";
import { Switch, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { Input } from "@/src/shared/components/Input";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { COLORS } from "@/src/shared/constants";
import { copyText } from "@/src/shared/lib/clipboard";
import { buildPortalLink } from "@/src/core/utils/portalLink";
import { generatePortalPassword } from "@/src/core/utils/portalPassword";
import { isolate } from "@/src/core/utils/bidi";

interface Props {
  customerId: string | null;
  portalBaseUrl: string | null;
  enabled: boolean;
  password: string;
  onEnabledChange: (next: boolean) => void;
  onPasswordChange: (next: string) => void;
}

// The whole portal block hides itself until the SaaS owner has set
// CustomerPortalUrl - without a base URL there is no link to hand out.
export function PortalAccessField({
  customerId,
  portalBaseUrl,
  enabled,
  password,
  onEnabledChange,
  onPasswordChange,
}: Props) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!portalBaseUrl?.trim()) return null;

  const link = customerId ? buildPortalLink(portalBaseUrl, customerId) : null;

  // Switching the portal on with an empty box would refuse to save, so the
  // password is filled in for staff. An existing one is never overwritten.
  function handleEnabledChange(next: boolean) {
    if (next && !password.trim()) {
      onPasswordChange(generatePortalPassword());
      setRevealed(true);
    }
    onEnabledChange(next);
  }

  async function handleCopy() {
    if (!link) return;
    if (await copyText(link)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <View className="border-t border-gray-100 pt-3 mb-4">
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-1 me-4">
          <Text fontWeight="SemiBold" className="text-sm text-gray-900">
            {t("customers.portal_label")}
          </Text>
          <Text className="text-xs text-gray-400 mt-0.5">
            {t("customers.portal_hint")}
          </Text>
        </View>
        <Switch value={enabled} onValueChange={handleEnabledChange} />
      </View>

      {enabled ? (
        <>
          <Input
            label={t("customers.portal_password_label") + " *"}
            value={password}
            onChangeText={onPasswordChange}
            placeholder={t("customers.portal_password_placeholder")}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!revealed}
            trailing={
              <View className="flex-row gap-2">
                <PressableOpacity
                  onPress={() => {
                    onPasswordChange(generatePortalPassword());
                    setRevealed(true);
                  }}
                  className="w-12 h-12 rounded-xl border border-gray-200 bg-white items-center justify-center"
                >
                  <Ionicons
                    name="refresh-outline"
                    size={22}
                    color={COLORS.primary}
                  />
                </PressableOpacity>
                <PressableOpacity
                  onPress={() => setRevealed((prev) => !prev)}
                  className="w-12 h-12 rounded-xl border border-gray-200 bg-white items-center justify-center"
                >
                  <Ionicons
                    name={revealed ? "eye-off-outline" : "eye-outline"}
                    size={22}
                    color={COLORS.primary}
                  />
                </PressableOpacity>
              </View>
            }
          />
          <Text className="text-xs text-gray-400 -mt-2 mb-4">
            {t("customers.portal_password_generated_hint")}
          </Text>

          {link ? (
            <View className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <Text className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">
                {t("customers.portal_link_label")}
              </Text>
              <Text className="text-xs text-gray-700" numberOfLines={2}>
                {isolate(link)}
              </Text>
              <PressableOpacity
                onPress={handleCopy}
                className="flex-row items-center gap-1.5 mt-2.5"
              >
                <Ionicons
                  name={copied ? "checkmark-circle" : "copy-outline"}
                  size={16}
                  color={copied ? COLORS.success : COLORS.primary}
                />
                <Text
                  fontWeight="SemiBold"
                  className="text-xs"
                  style={{ color: copied ? COLORS.success : COLORS.primary }}
                >
                  {copied
                    ? t("customers.portal_copied")
                    : t("customers.portal_copy_link")}
                </Text>
              </PressableOpacity>
            </View>
          ) : (
            <Text className="text-xs text-gray-400">
              {t("customers.portal_link_after_save")}
            </Text>
          )}
        </>
      ) : null}
    </View>
  );
}
