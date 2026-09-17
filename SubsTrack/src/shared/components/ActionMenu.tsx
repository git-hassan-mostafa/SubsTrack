import { View } from "react-native";
import { PressableOpacity } from "./PressableOpacity";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { BottomSheetScaffold } from "./BottomSheetScaffold";
import { SheetDragArea } from "./SheetDragArea";
import { sortActions, type ActionGroup } from "@/src/shared/lib/actionOrder";

export interface ActionMenuItem {
  key: string;
  label: string;
  group?: ActionGroup;
  icon?: keyof typeof Ionicons.glyphMap;
  iconBadge?: keyof typeof Ionicons.glyphMap;
  renderIcon?: (size: number) => React.ReactNode;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  caption?: string;
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
  const rows = sortActions(actions);

  function handlePress(item: ActionMenuItem) {
    if (item.disabled) return;
    onDismiss();
    item.onPress();
  }

  return (
    <BottomSheetScaffold visible={visible} onDismiss={onDismiss}>
      <SheetDragArea activationDistance={12}>
        <View className="flex-row items-center justify-between px-5 pt-2 pb-3 border-b border-gray-100">
          {title ? (
            <Text
              className="flex-1 me-3 text-base text-gray-900"
              fontWeight="Bold"
              numberOfLines={1}
            >
              {title}
            </Text>
          ) : (
            <View className="flex-1" />
          )}
          <PressableOpacity
            onPress={onDismiss}
            hitSlop={8}
            accessibilityLabel={t("common.close")}
          >
            <Ionicons name="close" size={22} color={COLORS.gray500} />
          </PressableOpacity>
        </View>

        {rows.length === 0 ? (
          <View className="px-5 py-6 items-center">
            <Text className="text-sm text-gray-500">
              {emptyLabel ?? t("common.no_actions_available")}
            </Text>
          </View>
        ) : (
          rows.map((item, index) => (
            <PressableOpacity
              key={item.key}
              onPress={() => handlePress(item)}
              disabled={item.disabled}
              className={`flex-row items-center px-5 py-4 ${
                index > 0 ? "border-t border-gray-100" : ""
              } ${item.disabled ? "opacity-40" : ""}`}
            >
              {item.renderIcon ? (
                <View className="w-7 items-start">{item.renderIcon(20)}</View>
              ) : item.icon ? (
                <View className="w-7 items-start">
                  <View>
                    <Ionicons
                      name={item.icon}
                      size={20}
                      color={item.destructive ? COLORS.danger : COLORS.gray700}
                    />
                    {item.iconBadge ? (
                      <View className="absolute -bottom-0.5 right-0 rounded-full bg-white">
                        <Ionicons
                          name={item.iconBadge}
                          size={11}
                          color={
                            item.destructive ? COLORS.danger : COLORS.gray700
                          }
                        />
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}
              <View className="flex-1">
                <Text
                  className={`text-base ${
                    item.destructive ? "text-danger" : "text-gray-900"
                  }`}
                  fontWeight="Medium"
                >
                  {item.label}
                </Text>
                {item.caption ? (
                  <Text className="text-xs text-gray-400 mt-0.5">
                    {item.caption}
                  </Text>
                ) : null}
              </View>
            </PressableOpacity>
          ))
        )}
      </SheetDragArea>
    </BottomSheetScaffold>
  );
}
