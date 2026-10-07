import { useState, type ComponentProps } from "react";
import { Switch, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { Input } from "@/src/shared/components/Input";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { COLORS } from "@/src/shared/constants";
import { useCopyText } from "@/src/shared/hooks/useCopyText";
import { buildPortalLink } from "@shared/core/utils/portalLink";
import {
  generatePortalPassword,
  portalPasswordOnEnable,
} from "@shared/core/utils/portalPassword";
import { isolate } from "@shared/core/utils/bidi";

interface Props {
  customerId: string | null;
  portalBaseUrl: string | null;
  enabled: boolean;
  password: string;
  onEnabledChange: (next: boolean) => void;
  onPasswordChange: (next: string) => void;
}

// Hidden until the SaaS owner sets CustomerPortalUrl: no base URL, no link.
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
  const { copied, copy } = useCopyText();
  const passwordCopy = useCopyText();

  if (!portalBaseUrl?.trim()) return null;

  const link = customerId ? buildPortalLink(portalBaseUrl, customerId) : null;

  function handleEnabledChange(next: boolean) {
    const filled = next ? portalPasswordOnEnable(password) : password;
    if (filled !== password) {
      onPasswordChange(filled);
      setRevealed(true);
    }
    onEnabledChange(next);
  }

  async function handleCopy() {
    if (link) await copy(link);
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
                <FieldIconButton
                  icon="refresh-outline"
                  onPress={() => {
                    onPasswordChange(generatePortalPassword());
                    setRevealed(true);
                  }}
                />
                <FieldIconButton
                  icon={revealed ? "eye-off-outline" : "eye-outline"}
                  onPress={() => setRevealed((prev) => !prev)}
                />
                <FieldIconButton
                  icon={passwordCopy.copied ? "checkmark-circle" : "copy-outline"}
                  color={passwordCopy.copied ? COLORS.success : COLORS.primary}
                  accessibilityLabel={t("customers.portal_copy_password")}
                  disabled={!password}
                  onPress={() => void passwordCopy.copy(password)}
                />
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

interface FieldIconButtonProps {
  icon: ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  color?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
}

function FieldIconButton({
  icon,
  onPress,
  color = COLORS.primary,
  accessibilityLabel,
  disabled,
}: FieldIconButtonProps) {
  return (
    <PressableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      className={`w-12 h-12 rounded-xl border border-gray-200 bg-white items-center justify-center ${disabled ? "opacity-40" : ""}`}
    >
      <Ionicons name={icon} size={22} color={color} />
    </PressableOpacity>
  );
}
