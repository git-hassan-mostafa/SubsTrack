import type { ComponentProps } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";

export type IconTileSize = 40 | 48 | 56;

const SIZE: Record<IconTileSize, { box: string; icon: number }> = {
  40: { box: "w-10 h-10", icon: 20 },
  48: { box: "w-12 h-12", icon: 22 },
  56: { box: "w-14 h-14", icon: 24 },
};

interface Props {
  icon: ComponentProps<typeof Ionicons>["name"];
  color?: string;
  bgClassName?: string;
  size?: IconTileSize;
}

export function IconTile({
  icon,
  color = COLORS.primary,
  bgClassName = "bg-primary-container",
  size = 40,
}: Props) {
  return (
    <View
      className={`${SIZE[size].box} rounded-full items-center justify-center ${bgClassName}`}
    >
      <Ionicons name={icon} size={SIZE[size].icon} color={color} />
    </View>
  );
}
