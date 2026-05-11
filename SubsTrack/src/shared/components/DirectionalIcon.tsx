import { I18nManager } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type DirectionalIconName =
  | "chevron-back"
  | "chevron-forward"
  | "arrow-back"
  | "arrow-forward";

const FLIPPED: Record<DirectionalIconName, DirectionalIconName> = {
  "chevron-back": "chevron-forward",
  "chevron-forward": "chevron-back",
  "arrow-back": "arrow-forward",
  "arrow-forward": "arrow-back",
};

interface Props {
  name: DirectionalIconName;
  size?: number;
  color?: string;
}

export function DirectionalIcon({ name, size = 22, color }: Props) {
  const resolvedName = I18nManager.isRTL ? FLIPPED[name] : name;
  return <Ionicons name={resolvedName} size={size} color={color} />;
}
