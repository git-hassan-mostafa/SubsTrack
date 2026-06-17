import { Modal, Pressable, View } from "react-native";
import { useEffect, useRef } from "react";
import { PressableOpacity } from "./PressableOpacity";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";

export interface ActionMenuItem {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface ActionMenuProps {
  visible: boolean;
  title?: string;
  actions: ActionMenuItem[];
  onDismiss: () => void;
  emptyLabel?: string;
}

export function ActionMenu({
  visible,
  title,
  actions,
  onDismiss,
  emptyLabel,
}: ActionMenuProps) {
  const { t } = useTranslation();

  // While the modal fades out, `visible` is already false but `actions` is
  // typically cleared to [] by the parent in the same render. Keep showing the
  // last actions during the fade so the empty state doesn't flash.
  const lastActionsRef = useRef(actions);
  useEffect(() => {
    if (visible) lastActionsRef.current = actions;
  }, [visible, actions]);
  const displayedActions = visible ? actions : lastActionsRef.current;

  function handlePress(item: ActionMenuItem) {
    if (item.disabled) return;
    onDismiss();
    item.onPress();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable
        onPress={onDismiss}
        className="flex-1 bg-black/50 items-center justify-center px-8"
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl w-full overflow-hidden"
        >
          {title ? (
            <View className="px-5 pt-4 pb-3 border-b border-gray-100">
              <Text
                className="text-base text-gray-900"
                fontWeight="SemiBold"
                numberOfLines={1}
              >
                {title}
              </Text>
            </View>
          ) : null}

          {displayedActions.length === 0 ? (
            <View className="px-5 py-6 items-center">
              <Text className="text-sm text-gray-500">
                {emptyLabel ?? t("common.no_actions_available")}
              </Text>
            </View>
          ) : (
            displayedActions.map((item, index) => (
              <PressableOpacity
                key={item.key}
                onPress={() => handlePress(item)}
                disabled={item.disabled}
                className={`flex-row items-center px-5 py-4 ${
                  index > 0 ? "border-t border-gray-100" : ""
                } ${item.disabled ? "opacity-40" : ""}`}
              >
                {item.icon ? (
                  <View className="w-7 items-start">
                    <Ionicons
                      name={item.icon}
                      size={20}
                      color={item.destructive ? COLORS.danger : COLORS.gray700}
                    />
                  </View>
                ) : null}
                <Text
                  className={`text-base ${
                    item.destructive ? "text-danger" : "text-gray-900"
                  }`}
                  fontWeight="Medium"
                >
                  {item.label}
                </Text>
              </PressableOpacity>
            ))
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
