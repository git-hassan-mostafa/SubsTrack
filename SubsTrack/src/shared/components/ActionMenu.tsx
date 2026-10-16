import { View, useWindowDimensions } from "react-native";
import { SheetScrollView } from "./SheetScrollComponents";
import { PressableOpacity } from "./PressableOpacity";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { BottomSheetScaffold } from "./BottomSheetScaffold";
import { SheetHeader } from "./SheetHeader";
import { sortActions, type ActionGroup } from "@shared/shared/lib/actionOrder";

const ROWS_MAX_HEIGHT_RATIO = 0.65;

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
  const { height } = useWindowDimensions();
  const rows = sortActions(actions);

  function handlePress(item: ActionMenuItem) {
    if (item.disabled) return;
    onDismiss();
    item.onPress();
  }

  return (
    <BottomSheetScaffold visible={visible} onDismiss={onDismiss}>
      <SheetHeader title={title} onClose={onDismiss} closeStyle="icon" />

      {rows.length === 0 ? (
        <View className="px-5 py-6 items-center">
          <Text className="text-sm text-gray-500">
            {emptyLabel ?? t("common.no_actions_available")}
          </Text>
        </View>
      ) : (
        <SheetScrollView
          style={{ maxHeight: Math.round(height * ROWS_MAX_HEIGHT_RATIO) }}
        >
          {rows.map((item) => (
            <PressableOpacity
              key={item.key}
              onPress={() => handlePress(item)}
              disabled={item.disabled}
              className={`flex-row items-center min-h-14 px-5 py-3 ${
                item.disabled ? "opacity-40" : ""
              }`}
            >
              {item.renderIcon ? (
                <View className="w-10 items-start">{item.renderIcon(22)}</View>
              ) : item.icon ? (
                <View className="w-10 items-start">
                  <View>
                    <Ionicons
                      name={item.icon}
                      size={22}
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
                  <Text className="text-xs text-gray-500 mt-0.5">
                    {item.caption}
                  </Text>
                ) : null}
              </View>
            </PressableOpacity>
          ))}
        </SheetScrollView>
      )}
    </BottomSheetScaffold>
  );
}