import { View } from "react-native";
import { PressableOpacity } from "./PressableOpacity/PressableOpacity";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { BottomSheetScaffold } from "./BottomSheetScaffold";
import { SheetDragArea } from "./SheetDragArea";

export interface ActionMenuItem {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Small glyph punched into the icon's bottom corner (e.g. `add` on "record sale"). */
  iconBadge?: keyof typeof Ionicons.glyphMap;
  /**
   * Custom glyph replacing `icon`/`iconBadge` — for marks a single Ionicon
   * can't express (e.g. the pay/report + WhatsApp combos). Gets the size the
   * menu would have used; it owns its own colour.
   */
  renderIcon?: (size: number) => React.ReactNode;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Small second line under the label — mainly why a disabled row is disabled. */
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

  function handlePress(item: ActionMenuItem) {
    if (item.disabled) return;
    onDismiss();
    item.onPress();
  }

  return (
    <BottomSheetScaffold visible={visible} onDismiss={onDismiss}>
      {/* The WHOLE menu drags the sheet, not just its title: the body is a plain
          column of buttons with no scrollable, so nothing can be stolen from a
          list. The 12pt threshold keeps a slightly sloppy tap a tap. */}
      <SheetDragArea activationDistance={12}>
        {title ? (
          <View className="px-5 pt-2 pb-3 border-b border-gray-100">
            <Text
              className="text-base text-gray-900"
              fontWeight="SemiBold"
              numberOfLines={1}
            >
              {title}
            </Text>
          </View>
        ) : null}

        {actions.length === 0 ? (
          <View className="px-5 py-6 items-center">
            <Text className="text-sm text-gray-500">
              {emptyLabel ?? t("common.no_actions_available")}
            </Text>
          </View>
        ) : (
          actions.map((item, index) => (
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
