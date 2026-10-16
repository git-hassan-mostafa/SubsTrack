import type { ComponentProps } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { CommonActions } from "expo-router/react-navigation";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { COLORS } from "@/src/shared/constants";

type Glyph = ComponentProps<typeof Ionicons>["name"];

export interface AppTab {
  name: string;
  label: string;
  icon: Glyph;
  iconOutline: Glyph;
}

export const TAB_BAR_HEIGHT = 80;

interface Props extends BottomTabBarProps {
  tabs: AppTab[];
}

// emits tabPress like the default bar, so a second tap still pops to the top (#82)
export function AppTabBar({ state, navigation, insets, tabs }: Props) {
  return (
    <View
      className="flex-row bg-white border-t border-gray-100"
      style={{ height: TAB_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }}
    >
      {tabs.map((tab) => {
        const route = state.routes.find((r) => r.name === tab.name);
        if (!route) return null;
        const focused = state.routes[state.index]?.key === route.key;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.dispatch({
              ...CommonActions.navigate(route),
              target: state.key,
            });
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: "tabLongPress", target: route.key });
        };

        return (
          <PressableOpacity
            key={route.key}
            onPress={onPress}
            onLongPress={onLongPress}
            ripple="none"
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={tab.label}
            className="flex-1 items-center justify-center gap-1"
          >
            <PressableOpacity
              onPress={onPress}
              onLongPress={onLongPress}
              importantForAccessibility="no"
              containerClassName={`rounded-full ${focused ? "bg-primary-container" : ""}`}
              className="w-16 h-8 items-center justify-center"
            >
              <Ionicons
                name={focused ? tab.icon : tab.iconOutline}
                size={24}
                color={focused ? COLORS.onPrimaryContainer : COLORS.gray600}
              />
            </PressableOpacity>
            <Text
              fontWeight={focused ? "SemiBold" : "Medium"}
              numberOfLines={1}
              className={`text-xs px-1 ${focused ? "text-gray-900" : "text-gray-600"}`}
            >
              {tab.label}
            </Text>
          </PressableOpacity>
        );
      })}
    </View>
  );
}
