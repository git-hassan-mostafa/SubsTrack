import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { useTranslation } from "react-i18next";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import type { AppUser } from "@/src/core/types";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import { useUserStore } from "../store/userStore";

interface Props {
  visible: boolean;
  user?: AppUser | null;
  onDismiss: () => void;
}

export function UserFormSheet({ visible, user: editUser, onDismiss }: Props) {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const { createUser, updateUser, loading, error, clearError } = useUserStore();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");

  const isOwnAccount = editUser?.id === currentUser?.id;

  const usernameInvalid =
    username.length > 0 && !/^[a-zA-Z0-9._]+$/.test(username);

  const passwordMismatch =
    !editUser &&
    password.length >= 8 &&
    confirmPassword.length > 0 &&
    password !== confirmPassword;

  useEffect(() => {
    if (visible) {
      setUsername(editUser?.username ?? "");
      setPassword("");
      setConfirmPassword("");
      setPhone(editUser?.phoneNumber ?? "");
      setRole((editUser?.role as "admin" | "user") ?? "user");
      clearError();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editUser]);

  async function handleSubmit() {
    if (!currentUser) return;
    if (editUser) {
      await updateUser(editUser.id, currentUser.id, currentUser.role, {
        username,
        phone: phone || null,
        role,
      });
    } else {
      await createUser(
        { username, password, phone: phone || null, role },
        currentUser.tenantId,
      );
    }
    if (!useUserStore.getState().error) onDismiss();
  }

  const canSubmit =
    !!username.trim() &&
    !usernameInvalid &&
    (!!editUser || (password.length >= 8 && password === confirmPassword));

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View className="flex-1 bg-white">
        {/* Drag handle */}
        <View className="items-center pt-3 pb-1">
          <View className="w-10 h-1 rounded-full bg-gray-300" />
        </View>

        <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
          <Text fontWeight="Bold" className="text-lg text-gray-900">
            {editUser ? t("users.edit_title") : t("users.add_title")}
          </Text>
          <Pressable onPress={onDismiss}>
            <Text className="text-base text-primary font-medium">
              {t("common.cancel")}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          className="flex-1 px-6 pt-6"
          keyboardShouldPersistTaps="handled"
        >
          {error ? (
            <ErrorBanner message={error} onDismiss={clearError} />
          ) : null}

          <Input
            label={t("users.username_label")}
            value={username}
            onChangeText={setUsername}
            placeholder={t("users.username_placeholder")}
            autoCapitalize="none"
            onFocus={clearError}
            error={usernameInvalid ? t("users.username_invalid_chars") : undefined}
          />

          {!editUser ? (
            <>
              <Input
                label={t("users.password_label")}
                value={password}
                onChangeText={setPassword}
                placeholder={t("users.password_placeholder")}
                secureTextEntry
                onFocus={clearError}
              />
              <Input
                label={t("users.confirm_password_label")}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder={t("users.confirm_password_placeholder")}
                secureTextEntry
                onFocus={clearError}
                error={
                  passwordMismatch ? t("users.password_mismatch") : undefined
                }
              />
            </>
          ) : null}

          <Input
            label={t("users.phone_optional")}
            value={phone}
            onChangeText={setPhone}
            placeholder={t("customers.phone_placeholder")}
            keyboardType="phone-pad"
          />

          <Text className="text-sm font-medium text-gray-700 mb-2">
            {t("users.role_label")}
          </Text>
          <View className="flex-row gap-3 mb-6">
            {(["user", "admin"] as const).map((r) => (
              <Pressable
                key={r}
                onPress={() => !isOwnAccount && setRole(r)}
                className={`flex-1 border rounded-lg py-3 items-center ${
                  role === r ? "border-primary bg-indigo-50" : "border-gray-300"
                } ${isOwnAccount ? "opacity-40" : ""}`}
              >
                <Text
                  className={`font-medium capitalize ${role === r ? "text-primary" : "text-gray-600"}`}
                >
                  {t(`users.${r}`)}
                </Text>
              </Pressable>
            ))}
          </View>
          {isOwnAccount ? (
            <Text className="text-xs text-gray-400 mb-4 -mt-4">
              {t("common.cannot_change_own_role")}
            </Text>
          ) : null}

          <Button
            label={editUser ? t("common.save_changes") : t("users.add_title")}
            onPress={handleSubmit}
            loading={loading}
            disabled={!canSubmit}
            fullWidth
          />
        </ScrollView>
      </View>
    </Modal>
  );
}
